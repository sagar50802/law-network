// server/routes/prep.js
import express from "express";
import multer from "multer";
import mongoose from "mongoose";
import { isAdmin } from "./utils.js";
import PrepExam from "../models/PrepExam.js";
import PrepModule from "../models/PrepModule.js";
import PrepAccess from "../models/PrepAccess.js";
import PrepProgress from "../models/PrepProgress.js";

const router = express.Router();

/* -------------------------------- helpers -------------------------------- */

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 40 * 1024 * 1024 }, // 40 MB
});

function truthy(v) {
  return ["true", "1", "on", "yes"].includes(String(v).trim().toLowerCase());
}

let R2 = null;
try { R2 = await import("../utils/r2.js"); } catch { R2 = null; }

function grid(bucket) {
  const db = mongoose.connection?.db;
  if (!db) return null;
  return new mongoose.mongo.GridFSBucket(db, { bucketName: bucket });
}

function safeName(filename = "file") {
  return String(filename).replace(/\s+/g, "_").replace(/[^\w.\-]/g, "");
}

// ✅ R2 (if configured) → GridFS fallback
async function storeBuffer({ buffer, filename, mime, bucket = "prep" }) {
  const name = safeName(filename || "file");
  const contentType = mime || "application/octet-stream";

  if (R2 && typeof R2.r2Enabled === "function" && R2.r2Enabled() && typeof R2.uploadBuffer === "function") {
    try {
      const key = `${bucket}/${name}`;
      const url = await R2.uploadBuffer(key, buffer, contentType);
      return { url, via: "r2" };
    } catch (e) {
      console.warn("[prep] R2 upload failed, falling back to GridFS:", e?.message || e);
    }
  }

  // GridFS
  const g = grid(bucket);
  if (!g) throw Object.assign(new Error("DB not connected"), { status: 503 });
  const id = await new Promise((resolve, reject) => {
    const ws = g.openUploadStream(name, { contentType });
    ws.on("error", reject);
    ws.on("finish", () => resolve(ws.id));
    ws.end(buffer);
  });
  return { url: `/api/files/${bucket}/${String(id)}`, via: "gridfs" };
}

// OCR (optional)
let OCR = null;
try { OCR = await import("../utils/ocr.js"); } catch { OCR = null; }

async function runOcrSafe(buffer) {
  try {
    if (!buffer) return "";
    if (OCR?.extractOCRFromBuffer) return await OCR.extractOCRFromBuffer(buffer, "eng+hin");
    if (OCR?.runOCR) return await OCR.runOCR(buffer, "eng+hin");
    return "";
  } catch (e) {
    console.warn("[prep] OCR failed:", e?.message || e);
    return "";
  }
}

// Lazy OCR helpers for GridFS URLs
const { Types } = mongoose;
async function gridFetchBuffer(bucket, id) {
  const g = grid(bucket);
  if (!g) return null;
  return new Promise((res, rej) => {
    const rs = g.openDownloadStream(new Types.ObjectId(id));
    const chunks = [];
    rs.on("data", (d) => chunks.push(d));
    rs.on("error", rej);
    rs.on("end", () => res(Buffer.concat(chunks)));
  });
}
function tryGetGridIdFromUrl(url = "") {
  const m = String(url).match(/\/api\/files\/([^/]+)\/([0-9a-f]{24})$/i);
  return m ? { bucket: m[1], id: m[2] } : null;
}

// Accept files even if the frontend used alternate names or upload.any()
function collectIncomingFiles(req) {
  const out = {
    images: [].concat(req.files?.images || []),
    pdf: [].concat(req.files?.pdf || []),
    audio: [].concat(req.files?.audio || []),
    video: [].concat(req.files?.video || []),
  };
  const pool = Array.isArray(req.files) ? req.files : [];
  const add = (arr, f) => { if (f && f.buffer?.length) arr.push(f); };
  for (const f of pool) {
    const name = (f.fieldname || "").toLowerCase();
    if (["images[]", "images", "image", "files", "photos", "pictures"].includes(name)) add(out.images, f);
    else if (["pdf", "document"].includes(name)) add(out.pdf, f);
    else if (["audio", "audios", "sound", "music"].includes(name)) add(out.audio, f);
    else if (["video", "videos", "movie", "clip"].includes(name)) add(out.video, f);
  }
  return out;
}

/* -------------------------------- exams -------------------------------- */

router.get("/exams", async (_req, res) => {
  const exams = await PrepExam.find({}).sort({ name: 1 }).lean();
  res.json({ success: true, exams });
});

router.post("/exams", isAdmin, async (req, res) => {
  const { examId, name, scheduleMode = "cohort" } = req.body || {};
  if (!examId || !name) return res.status(400).json({ success: false, error: "examId & name required" });
  const doc = await PrepExam.findOneAndUpdate(
    { examId },
    { $set: { name, scheduleMode } },
    { upsert: true, new: true }
  );
  res.json({ success: true, exam: doc });
});

/* ------------------------------- templates ------------------------------- */

// list
router.get("/templates", async (req, res) => {
  const { examId } = req.query || {};
  if (!examId) return res.status(400).json({ success: false, error: "examId required" });
  const items = await PrepModule.find({ examId }).sort({ dayIndex: 1, slotMin: 1 }).lean();
  res.json({ success: true, items });
});

// create
router.post(
  "/templates",
  (req, res, next) =>
    upload.fields([
      { name: "images", maxCount: 12 },
      { name: "pdf", maxCount: 1 },
      { name: "audio", maxCount: 1 },
      { name: "video", maxCount: 1 },
    ])(req, res, (err) => {
      if (!err && (!req.files || (Object.keys(req.files).length === 0))) {
        return upload.any()(req, res, next);
      }
      next(err);
    }),
  isAdmin,
  async (req, res) => {
    try {
      const {
        examId, dayIndex, slotMin = 0, title = "", description = "",
        releaseAt, content = "", manualText = "",
        extractOCR = "false", showOriginal = "false", allowDownload = "false",
        highlight = "false", background = "",
        ocrAtRelease = "false", deferOCRUntilRelease = "false",
      } = req.body || {};

      if (!examId || !dayIndex) {
        return res.status(400).json({ success: false, error: "examId & dayIndex required" });
      }

      const incoming = collectIncomingFiles(req);
      const files = [];
      const add = (kind, payload, mime) => files.push({ kind, url: payload.url, mime: mime || "" });
      const toStore = (f) =>
        storeBuffer({
          buffer: f.buffer,
          filename: f.originalname || f.fieldname,
          mime: f.mimetype || "application/octet-stream",
        });

      for (const f of incoming.images) try { add("image", await toStore(f), f.mimetype); } catch {}
      for (const f of incoming.pdf) try { add("pdf", await toStore(f), f.mimetype); } catch {}
      for (const f of incoming.audio) try { add("audio", await toStore(f), f.mimetype); } catch {}
      for (const f of incoming.video) try { add("video", await toStore(f), f.mimetype); } catch {}

      const relAt = releaseAt ? new Date(releaseAt) : null;
      const status = relAt && relAt > new Date() ? "scheduled" : "released";

      const wantsOCRAtRelease = truthy(ocrAtRelease) || truthy(deferOCRUntilRelease);
      const flags = {
        extractOCR: truthy(extractOCR) || wantsOCRAtRelease,
        ocrAtRelease: wantsOCRAtRelease,
        deferOCRUntilRelease: wantsOCRAtRelease,
        showOriginal: truthy(showOriginal),
        allowDownload: truthy(allowDownload),
        highlight: truthy(highlight),
        background,
      };

      let ocrText = "";
      const pasted = (content || manualText || "").trim();
      if (pasted) {
        ocrText = pasted;
      } else if (truthy(extractOCR) && !wantsOCRAtRelease && (incoming.images[0] || incoming.pdf[0])) {
        const src = (incoming.images[0] || incoming.pdf[0]).buffer;
        if (src?.length) ocrText = await runOcrSafe(src);
      }

      const doc = await PrepModule.create({
        examId,
        dayIndex: Number(dayIndex),
        slotMin: Number(slotMin || 0),
        title,
        description,
        files,
        flags,
        text: pasted || "",
        ocrText,
        releaseAt: relAt || undefined,
        status,
      });

      if (!doc?._id) {
        console.error("[prep] failed to create module properly");
        return res.status(500).json({ success: false, error: "Document not created" });
      }

      console.log("[prep] created:", { examId, title, files: files.length, status });
      return res.json({ success: true, item: doc });
    } catch (e) {
      console.error("[prep] create template failed:", e);
      return res.status(500).json({ success: false, error: e?.message || "server error" });
    }
  }
);

// update
router.patch(
  "/templates/:id",
  (req, res, next) =>
    upload.fields([
      { name: "images", maxCount: 12 },
      { name: "pdf", maxCount: 1 },
      { name: "audio", maxCount: 1 },
      { name: "video", maxCount: 1 },
    ])(req, res, (err) => {
      if (!err && (!req.files || (Object.keys(req.files).length === 0))) {
        return upload.any()(req, res, next);
      }
      next(err);
    }),
  isAdmin,
  async (req, res) => {
    try {
      const doc = await PrepModule.findById(req.params.id);
      if (!doc) return res.status(404).json({ success: false, error: "Not found" });

      if (req.body.title != null) doc.title = req.body.title;
      if (req.body.description != null) doc.description = req.body.description;
      if (req.body.dayIndex != null) doc.dayIndex = Number(req.body.dayIndex);
      if (req.body.slotMin != null) doc.slotMin = Number(req.body.slotMin);

      const pasted =
        (req.body.content && String(req.body.content).trim()) ||
        (req.body.manualText && String(req.body.manualText).trim()) ||
        "";
      if (pasted) {
        doc.text = pasted;
        doc.ocrText = pasted;
      }

      if (req.body.releaseAt != null) {
        const rel = req.body.releaseAt ? new Date(req.body.releaseAt) : null;
        doc.releaseAt = rel || undefined;
        doc.status = rel && rel > new Date() ? "scheduled" : "released";
      }

      const setFlag = (k, v) => (doc.flags[k] = v);
      if (req.body.extractOCR != null) setFlag("extractOCR", truthy(req.body.extractOCR));
      if (req.body.ocrAtRelease != null) {
        const v = truthy(req.body.ocrAtRelease);
        setFlag("ocrAtRelease", v);
        setFlag("deferOCRUntilRelease", v);
      }
      if (req.body.showOriginal != null) setFlag("showOriginal", truthy(req.body.showOriginal));
      if (req.body.allowDownload != null) setFlag("allowDownload", truthy(req.body.allowDownload));
      if (req.body.highlight != null) setFlag("highlight", truthy(req.body.highlight));
      if (req.body.background != null) setFlag("background", req.body.background);
      if (req.body.deferOCRUntilRelease != null) {
        const v = truthy(req.body.deferOCRUntilRelease);
        setFlag("deferOCRUntilRelease", v);
        setFlag("ocrAtRelease", v);
      }

      const incoming = collectIncomingFiles(req);
      const push = (kind, payload, mime) => doc.files.push({ kind, url: payload.url, mime: mime || "" });
      const toStore = (f) =>
        storeBuffer({
          buffer: f.buffer,
          filename: f.originalname || f.fieldname,
          mime: f.mimetype || "application/octet-stream",
        });

      for (const f of incoming.images) try { push("image", await toStore(f), f.mimetype); } catch {}
      for (const f of incoming.pdf) try { push("pdf", await toStore(f), f.mimetype); } catch {}
      for (const f of incoming.audio) try { push("audio", await toStore(f), f.mimetype); } catch {}
      for (const f of incoming.video) try { push("video", await toStore(f), f.mimetype); } catch {}

      if (truthy(req.body.reOCR) && doc.flags.extractOCR && !doc.flags.ocrAtRelease && !doc.text) {
        const first = incoming.images[0] || incoming.pdf[0];
        if (first?.buffer?.length) doc.ocrText = await runOcrSafe(first.buffer);
      }

      await doc.save();
      return res.json({ success: true, item: doc });
    } catch (e) {
      console.error("[prep] patch template failed:", e);
      return res.status(500).json({ success: false, error: e?.message || "server error" });
    }
  }
);

// delete
router.delete("/templates/:id", isAdmin, async (req, res) => {
  try {
    const r = await PrepModule.findByIdAndDelete(req.params.id);
    if (!r) return res.status(404).json({ success: false, error: "Not found" });
    res.json({ success: true, removed: r._id });
  } catch (e) {
    res.status(500).json({ success: false, error: e?.message || "server error" });
  }
});

/* --------------------------------- access -------------------------------- */

router.post("/access/grant", isAdmin, async (req, res) => {
  const { userEmail, examId, planDays = 30, startAt } = req.body || {};
  if (!userEmail || !examId) return res.status(400).json({ success: false, error: "userEmail & examId required" });
  const start = startAt ? new Date(startAt) : new Date();
  const expiry = new Date(start.getTime() + Number(planDays) * 86400000);

  await PrepAccess.updateMany({ userEmail, examId, status: "active" }, { $set: { status: "archived" } });
  const access = await PrepAccess.create({
    userEmail,
    examId,
    planDays: Number(planDays),
    startAt: start,
    expiryAt: expiry,
    status: "active",
  });
  await PrepProgress.findOneAndUpdate(
    { userEmail, examId },
    { $set: { completedDays: [] } },
    { upsert: true, new: true }
  );

  res.json({ success: true, access });
});

/* -------------------------------- user APIs ------------------------------- */

// cohort-based summary for “today”
router.get("/user/summary", async (req, res) => {
  const { examId, email } = req.query || {};
  if (!examId) return res.status(400).json({ success: false, error: "examId required" });

  let access = null;
  if (email) access = await PrepAccess.findOne({ examId, userEmail: email, status: "active" }).lean();

  const now = new Date();
  const planDays = access?.planDays || 3;
  const startAt = access?.startAt || now;
  const dayIdx = Math.max(1, Math.min(planDays, Math.floor((now - new Date(startAt)) / 86400000) + 1));

  const all = await PrepModule.find({ examId, dayIndex: dayIdx }).sort({ releaseAt: 1, slotMin: 1 }).lean();

  const released = [];
  const upcomingToday = [];
  for (const m of all) {
    const rel = m.releaseAt ? new Date(m.releaseAt) : null;
    const isReleased = !rel || rel <= now || m.status === "released";
    if (isReleased) released.push(m);
    else if (rel && rel.toDateString() === now.toDateString()) {
      upcomingToday.push({ _id: m._id, title: m.title || "Untitled", releaseAt: rel });
    }
  }

  // Lazy OCR (GridFS sources only)
  for (const m of released) {
    const needsLazy =
      m?.flags?.extractOCR &&
      (m?.flags?.ocrAtRelease || m?.flags?.deferOCRUntilRelease) &&
      !m?.ocrText;
    if (needsLazy) {
      try {
        const first = (m.files || []).find(
          (f) => (f.kind === "image" || f.kind === "pdf") && /^\/api\/files\//.test(f.url)
        );
        if (first) {
          const meta = tryGetGridIdFromUrl(first.url);
          if (meta) {
            const buf = await gridFetchBuffer(meta.bucket, meta.id);
            if (buf) {
              const txt = await runOcrSafe(buf);
              if (txt) {
                await PrepModule.updateOne({ _id: m._id }, { $set: { ocrText: txt } });
                m.ocrText = txt;
              }
            }
          }
        }
      } catch { /* non-fatal */ }
    }
  }

  res.json({
    success: true,
    todayDay: dayIdx,
    planDays,
    modules: released,
    upcomingToday,
    comingLater: upcomingToday,
  });
});

// alias used by your frontend (returns items array)
router.get("/user/today", async (req, res) => {
  const { examId, email } = req.query || {};
  if (!examId) return res.status(400).json({ success: false, error: "examId required" });

  const now = new Date();
  let access = null;
  if (email) access = await PrepAccess.findOne({ examId, userEmail: email, status: "active" }).lean();
  const planDays = access?.planDays || 3;
  const startAt = access?.startAt || now;
  const dayIdx = Math.max(1, Math.min(planDays, Math.floor((now - new Date(startAt)) / 86400000) + 1));

  const all = await PrepModule.find({ examId, dayIndex: dayIdx }).sort({ releaseAt: 1, slotMin: 1 }).lean();
  const items = all.filter((m) => !m.releaseAt || new Date(m.releaseAt) <= now || m.status === "released");
  res.json({ success: true, items });
});

// mark complete (email optional → guest key)
router.post("/user/complete", async (req, res) => {
  const { examId, email, dayIndex } = req.body || {};
  if (!examId || !dayIndex) return res.status(400).json({ success: false, error: "examId & dayIndex required" });
  let userKey = (email || "").trim();
  if (!userKey) userKey = `guest:${req.ip || "0.0.0.0"}`;

  const doc = await PrepProgress.findOneAndUpdate(
    { userEmail: userKey, examId },
    { $addToSet: { completedDays: Number(dayIndex) } },
    { upsert: true, new: true }
  );
  res.json({ success: true, progress: doc });
});

/* --------------------------- auto-release cron ---------------------------- */

setInterval(async () => {
  try {
    const now = new Date();
    const r = await PrepModule.updateMany(
      { status: "scheduled", releaseAt: { $lte: now } },
      { $set: { status: "released" } }
    );
    if (r.modifiedCount) console.log(`[prep] auto-released ${r.modifiedCount} module(s)`);
  } catch (e) {
    console.warn("[prep] auto-release failed:", e?.message || e);
  }
}, 60_000);

export default router;
