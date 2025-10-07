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

/* --------- helpers --------- */
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 40 * 1024 * 1024 } });
function truthy(v) { return ["true", "1", "on", "yes"].includes(String(v).trim().toLowerCase()); }

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

async function storeBuffer({ buffer, filename, mime, bucket = "prep" }) {
  const name = safeName(filename || "file");
  const contentType = mime || "application/octet-stream";

  if (R2?.r2Enabled?.() && R2?.uploadBuffer) {
    try {
      const url = await R2.uploadBuffer(buffer, name, contentType);
      return { url, via: "r2" };
    } catch (e) {
      console.warn("[prep] R2 upload failed, falling back to GridFS:", e?.message || e);
    }
  }

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

let OCR = null;
try { OCR = await import("../utils/ocr.js"); } catch { OCR = null; }

async function runOcrSafe(buffer) {
  try {
    if (!buffer) return "";
    if (OCR?.extractOCRFromBuffer) return await OCR.extractOCRFromBuffer(buffer, "eng+hin");
    if (OCR?.runOCR)                return await OCR.runOCR(buffer, "eng+hin");
    return "";
  } catch (e) {
    console.warn("[prep] OCR failed:", e?.message || e);
    return "";
  }
}

// ------- helpers for lazy OCR-at-release (GridFS only) -------
const { Types } = mongoose;
async function gridFetchBuffer(bucket, id) {
  const g = grid(bucket);
  if (!g) return null;
  return new Promise((res, rej) => {
    const rs = g.openDownloadStream(new Types.ObjectId(id));
    const chunks = [];
    rs.on("data", d => chunks.push(d));
    rs.on("error", rej);
    rs.on("end", () => res(Buffer.concat(chunks)));
  });
}
function tryGetGridIdFromUrl(url = "") {
  const m = String(url).match(/\/api\/files\/([^/]+)\/([0-9a-f]{24})$/i);
  return m ? { bucket: m[1], id: m[2] } : null;
}

/* ================= Exams ================= */
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

/* ================= Templates (modules) ================= */
router.get("/templates", async (req, res) => {
  const { examId } = req.query || {};
  if (!examId) return res.status(400).json({ success: false, error: "examId required" });
  const items = await PrepModule.find({ examId }).sort({ dayIndex: 1, slotMin: 1 }).lean();
  res.json({ success: true, items });
});

router.post(
  "/templates",
  isAdmin,
  upload.fields([
    { name: "images", maxCount: 12 },
    { name: "pdf",    maxCount: 1  },
    { name: "audio",  maxCount: 1  },
    { name: "video",  maxCount: 1  },
  ]),
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

      const files = [];
      const addFile = (kind, f) => files.push({ kind, url: f.url, mime: f.mime || f.mimetype || "" });
      const toStore = async (f) =>
        storeBuffer({
          buffer: f.buffer,
          filename: f.originalname || f.fieldname,
          mime: f.mimetype || "application/octet-stream",
        });

      for (const f of req.files?.images || []) { try { addFile("image", { ...(await toStore(f)), mime: f.mimetype }); } catch {} }
      if (req.files?.pdf?.[0])   { const f = req.files.pdf[0];   try { addFile("pdf",   { ...(await toStore(f)), mime: f.mimetype }); } catch {} }
      if (req.files?.audio?.[0]) { const f = req.files.audio[0]; try { addFile("audio", { ...(await toStore(f)), mime: f.mimetype }); } catch {} }
      if (req.files?.video?.[0]) { const f = req.files.video[0]; try { addFile("video", { ...(await toStore(f)), mime: f.mimetype }); } catch {} }

      const relAt = releaseAt ? new Date(releaseAt) : null;
      const now = new Date();
      const status = relAt && relAt > now ? "scheduled" : "released";

      const wantsOCRAtRelease = truthy(ocrAtRelease) || truthy(deferOCRUntilRelease);
      const wantsImmediateOCR = truthy(extractOCR) && !wantsOCRAtRelease;

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
      if (pasted) ocrText = pasted;
      else if (wantsImmediateOCR && (req.files?.images?.[0] || req.files?.pdf?.[0])) {
        const src = (req.files?.images?.[0] || req.files?.pdf?.[0])?.buffer;
        if (src?.length) ocrText = await runOcrSafe(src);
      }

      const doc = await PrepModule.create({
        examId,
        dayIndex: Number(dayIndex),
        slotMin: Number(slotMin || 0),
        title,
        description,
        files,  // ✅ will persist now (schema updated)
        flags,
        text: pasted || "",
        ocrText,
        releaseAt: relAt || undefined,
        status,
      });

      res.json({ success: true, item: doc });
    } catch (e) {
      console.error("[prep] create template failed:", e);
      res.status(500).json({ success: false, error: e?.message || "server error" });
    }
  }
);

router.patch(
  "/templates/:id",
  isAdmin,
  upload.fields([
    { name: "images", maxCount: 12 },
    { name: "pdf",    maxCount: 1  },
    { name: "audio",  maxCount: 1  },
    { name: "video",  maxCount: 1  },
  ]),
  async (req, res) => {
    try {
      const doc = await PrepModule.findById(req.params.id);
      if (!doc) return res.status(404).json({ success: false, error: "Not found" });

      if (req.body.title       != null) doc.title = req.body.title;
      if (req.body.description != null) doc.description = req.body.description;
      if (req.body.dayIndex    != null) doc.dayIndex = Number(req.body.dayIndex);
      if (req.body.slotMin     != null) doc.slotMin = Number(req.body.slotMin);

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
        const now = new Date();
        doc.status = rel && rel > now ? "scheduled" : "released";
      }

      const setFlag = (k, v) => (doc.flags[k] = v);
      if (req.body.extractOCR   != null) setFlag("extractOCR",   truthy(req.body.extractOCR));
      if (req.body.ocrAtRelease != null) {
        const v = truthy(req.body.ocrAtRelease);
        setFlag("ocrAtRelease", v); setFlag("deferOCRUntilRelease", v);
      }
      if (req.body.showOriginal != null) setFlag("showOriginal", truthy(req.body.showOriginal));
      if (req.body.allowDownload!= null) setFlag("allowDownload",truthy(req.body.allowDownload));
      if (req.body.highlight    != null) setFlag("highlight",    truthy(req.body.highlight));
      if (req.body.background   != null) setFlag("background",   req.body.background);
      if (req.body.deferOCRUntilRelease != null) {
        const v = truthy(req.body.deferOCRUntilRelease);
        setFlag("deferOCRUntilRelease", v); setFlag("ocrAtRelease", v);
      }

      const toStore = async (f) =>
        storeBuffer({
          buffer: f.buffer,
          filename: f.originalname || f.fieldname,
          mime: f.mimetype || "application/octet-stream",
        });
      const pushFile = (kind, payload) =>
        doc.files.push({ kind, url: payload.url, mime: payload.mimetype || "" });

      for (const f of req.files?.images || []) { try { pushFile("image", { ...(await toStore(f)), mimetype: f.mimetype }); } catch {} }
      if (req.files?.pdf?.[0])   { const f = req.files.pdf[0];   try { pushFile("pdf",   { ...(await toStore(f)), mimetype: f.mimetype }); } catch {} }
      if (req.files?.audio?.[0]) { const f = req.files.audio[0]; try { pushFile("audio", { ...(await toStore(f)), mimetype: f.mimetype }); } catch {} }
      if (req.files?.video?.[0]) { const f = req.files.video[0]; try { pushFile("video", { ...(await toStore(f)), mimetype: f.mimetype }); } catch {} }

      if (truthy(req.body.reOCR) && doc.flags.extractOCR && !doc.flags.ocrAtRelease && !doc.text) {
        const uploaded = (req.files?.images?.[0] || req.files?.pdf?.[0])?.buffer;
        if (uploaded?.length) doc.ocrText = await runOcrSafe(uploaded);
      }

      await doc.save();
      res.json({ success: true, item: doc });
    } catch (e) {
      console.error("[prep] patch template failed:", e);
      res.status(500).json({ success: false, error: e?.message || "server error" });
    }
  }
);

router.delete("/templates/:id", isAdmin, async (req, res) => {
  try {
    const r = await PrepModule.findByIdAndDelete(req.params.id);
    if (!r) return res.status(404).json({ success: false, error: "Not found" });
    res.json({ success: true, removed: r._id });
  } catch (e) {
    res.status(500).json({ success: false, error: e?.message || "server error" });
  }
});

/* ================= Access (cohort) ================= */
router.post("/access/grant", isAdmin, async (req, res) => {
  const { userEmail, examId, planDays = 30, startAt } = req.body || {};
  if (!userEmail || !examId) return res.status(400).json({ success: false, error: "userEmail & examId required" });
  const start  = startAt ? new Date(startAt) : new Date();
  const expiry = new Date(start.getTime() + Number(planDays) * 86400000);

  await PrepAccess.updateMany({ userEmail, examId, status: "active" }, { $set: { status: "archived" } });
  const access = await PrepAccess.create({ userEmail, examId, planDays: Number(planDays), startAt: start, expiryAt: expiry, status: "active" });
  await PrepProgress.findOneAndUpdate({ userEmail, examId }, { $set: { completedDays: [] } }, { upsert: true, new: true });

  res.json({ success: true, access });
});

/* ================= User summary (released vs upcoming + lazy OCR) ================= */
router.get("/user/summary", async (req, res) => {
  const { examId, email } = req.query || {};
  if (!examId) return res.status(400).json({ success: false, error: "examId required" });

  let access = null;
  if (email) {
    access = await PrepAccess.findOne({ examId, userEmail: email, status: "active" }).lean();
  }

  const now = new Date();
  const planDays = access?.planDays || 3;
  const startAt  = access?.startAt || now;
  const dayIdx   = Math.max(1, Math.min(planDays, Math.floor((now - new Date(startAt)) / 86400000) + 1));

  const all = await PrepModule
    .find({ examId, dayIndex: dayIdx })
    .sort({ releaseAt: 1, slotMin: 1 })
    .lean();

  const released = [];
  const upcomingToday = [];
  const now2 = new Date();

  for (const m of all) {
    const rel = m.releaseAt ? new Date(m.releaseAt) : null;
    const isReleased = !rel || rel <= now2 || m.status === "released";
    if (isReleased) released.push(m);
    else if (rel && rel.toDateString() === now2.toDateString()) {
      upcomingToday.push({ _id: m._id, title: m.title || "Untitled", releaseAt: rel });
    }
  }

  // lazy OCR if needed
  for (const m of released) {
    const needsLazy =
      m?.flags?.extractOCR &&
      (m?.flags?.ocrAtRelease || m?.flags?.deferOCRUntilRelease) &&
      !m?.ocrText;

    if (needsLazy) {
      try {
        const first = (m.files || []).find(f =>
          (f.kind === "image" || f.kind === "pdf") && /^\/api\/files\//.test(f.url)
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
      } catch {}
    }
  }

  res.json({
    success: true,
    todayDay: dayIdx,
    planDays,
    modules: released,        // includes files[] now that schema persists it
    upcomingToday,
    comingLater: upcomingToday,
  });
});

/* ============== OPTIONAL: give UI a non-404 full "today" endpoint ============== */
router.get("/user/today", async (req, res) => {
  const { examId, email } = req.query || {};
  if (!examId) return res.status(400).json({ success: false, error: "examId required" });

  let access = null;
  if (email) {
    access = await PrepAccess.findOne({ examId, userEmail: email, status: "active" }).lean();
  }
  const now = new Date();
  const planDays = access?.planDays || 3;
  const startAt  = access?.startAt || now;
  const dayIdx   = Math.max(1, Math.min(planDays, Math.floor((now - new Date(startAt)) / 86400000) + 1));

  const items = await PrepModule
    .find({ examId, dayIndex: dayIdx })
    .sort({ slotMin: 1, releaseAt: 1 })
    .lean();

  res.json({ success: true, items, todayDay: dayIdx, planDays });
});

/* ================= Light "cron" to flip scheduled → released ================= */
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
