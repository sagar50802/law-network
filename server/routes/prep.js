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

// 40 MB memory storage exactly like you had
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 40 * 1024 * 1024 } });

// truthy helper for checkboxes
function truthy(v) {
  return ["true", "1", "on", "yes"].includes(String(v).trim().toLowerCase());
}

// Optional R2 + GridFS fallback
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

  // Prefer R2 if available
  if (R2?.r2Enabled?.() && R2?.uploadBuffer) {
    try {
      const url = await R2.uploadBuffer(buffer, name, contentType);
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

// OCR helper (graceful)
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

// ------- NEW helpers for lazy OCR-at-release (GridFS only) -------
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

// list templates for an exam
router.get("/templates", async (req, res) => {
  const { examId } = req.query || {};
  if (!examId) return res.status(400).json({ success: false, error: "examId required" });
  const items = await PrepModule.find({ examId }).sort({ dayIndex: 1, slotMin: 1 }).lean();
  res.json({ success: true, items });
});

/* ---------- COMMON: normalize files from ANY field name ---------- */
/** Accept files even if the frontend used wrong field names or singles */
function collectIncomingFiles(req) {
  // priority: multer.fields() registered names
  const out = {
    images: [].concat(req.files?.images || []),
    pdf:    [].concat(req.files?.pdf    || []),
    audio:  [].concat(req.files?.audio  || []),
    video:  [].concat(req.files?.video  || []),
  };

  // Tolerate common alternate names or when upload.any() is used downstream
  const pool = Array.isArray(req.files) ? req.files : [];
  const add = (arr, f) => { if (f && f.buffer?.length) arr.push(f); };

  for (const f of pool) {
    const name = (f.fieldname || "").toLowerCase();
    if (["images[]","images","image","files","photos","pictures"].includes(name)) add(out.images, f);
    else if (["pdf","document"].includes(name)) add(out.pdf, f);
    else if (["audio","sound","music"].includes(name)) add(out.audio, f);
    else if (["video","movie","clip"].includes(name)) add(out.video, f);
  }

  return out;
}

/* -------- create module (releaseAt, pasted text, OCR-at-release) -------- */
router.post(
  "/templates",
  // Accept known field names AND gracefully accept any() in case of mismatch
  (req, res, next) => upload.fields([
    { name: "images", maxCount: 12 },
    { name: "pdf",    maxCount: 1  },
    { name: "audio",  maxCount: 1  },
    { name: "video",  maxCount: 1  },
  ])(req, res, (err) => {
    // If fields() didn't pick anything (wrong field names), fall back to any()
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
        // schedule + manual text
        releaseAt, content = "", manualText = "",
        // flags (aliases kept for compatibility)
        extractOCR = "false", showOriginal = "false", allowDownload = "false",
        highlight = "false", background = "",
        ocrAtRelease = "false", deferOCRUntilRelease = "false",
      } = req.body || {};

      if (!examId || !dayIndex) {
        return res.status(400).json({ success: false, error: "examId & dayIndex required" });
      }

      // merge files from any field name
      const incoming = collectIncomingFiles(req);
      const files = [];
      const toStore = async (f) =>
        storeBuffer({
          buffer: f.buffer,
          filename: f.originalname || f.fieldname,
          mime: f.mimetype || "application/octet-stream",
        });
      const addFile = (kind, payload, mime) => files.push({ kind, url: payload.url, mime: mime || "" });

      for (const f of incoming.images) { try { addFile("image", await toStore(f), f.mimetype); } catch {} }
      for (const f of incoming.pdf)    { try { addFile("pdf",   await toStore(f), f.mimetype); } catch {} }
      for (const f of incoming.audio)  { try { addFile("audio", await toStore(f), f.mimetype); } catch {} }
      for (const f of incoming.video)  { try { addFile("video", await toStore(f), f.mimetype); } catch {} }

      // schedule
      const relAt = releaseAt ? new Date(releaseAt) : null;
      const now = new Date();
      const status = relAt && relAt > now ? "scheduled" : "released";

      // OCR intent
      const wantsOCRAtRelease = truthy(ocrAtRelease) || truthy(deferOCRUntilRelease);
      const wantsImmediateOCR = truthy(extractOCR) && !wantsOCRAtRelease;

      // flags
      const flags = {
        extractOCR: truthy(extractOCR) || wantsOCRAtRelease,
        ocrAtRelease: wantsOCRAtRelease,
        deferOCRUntilRelease: wantsOCRAtRelease,
        showOriginal: truthy(showOriginal),
        allowDownload: truthy(allowDownload),
        highlight: truthy(highlight),
        background,
      };

      // text preference: manual content overrides OCR
      let ocrText = "";
      const pasted = (content || manualText || "").trim();
      if (pasted) {
        ocrText = pasted;
      } else if (wantsImmediateOCR && (incoming.images[0] || incoming.pdf[0])) {
        const src = (incoming.images[0] || incoming.pdf[0])?.buffer;
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

      res.json({ success: true, item: doc });
    } catch (e) {
      console.error("[prep] create template failed:", e);
      res.status(500).json({ success: false, error: e?.message || "server error" });
    }
  }
);

// update module (edit flags, add files, re-OCR, schedule, paste text)
router.patch(
  "/templates/:id",
  (req, res, next) => upload.fields([
    { name: "images", maxCount: 12 },
    { name: "pdf",    maxCount: 1  },
    { name: "audio",  maxCount: 1  },
    { name: "video",  maxCount: 1  },
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

      // basic fields
      if (req.body.title       != null) doc.title = req.body.title;
      if (req.body.description != null) doc.description = req.body.description;
      if (req.body.dayIndex    != null) doc.dayIndex = Number(req.body.dayIndex);
      if (req.body.slotMin     != null) doc.slotMin = Number(req.body.slotMin);

      // allow direct pasted text (content/manualText)
      const pasted =
        (req.body.content && String(req.body.content).trim()) ||
        (req.body.manualText && String(req.body.manualText).trim()) ||
        "";
      if (pasted) {
        doc.text = pasted;
        doc.ocrText = pasted; // immediately usable on UI
      }

      // schedule
      if (req.body.releaseAt != null) {
        const rel = req.body.releaseAt ? new Date(req.body.releaseAt) : null;
        doc.releaseAt = rel || undefined;
        const now = new Date();
        doc.status = rel && rel > now ? "scheduled" : "released";
      }

      // flags (add ocrAtRelease alias)
      const setFlag = (k, v) => (doc.flags[k] = v);
      if (req.body.extractOCR   != null) setFlag("extractOCR",   truthy(req.body.extractOCR));
      if (req.body.ocrAtRelease != null) {
        const v = truthy(req.body.ocrAtRelease);
        setFlag("ocrAtRelease", v);
        setFlag("deferOCRUntilRelease", v); // keep in sync
      }
      if (req.body.showOriginal != null) setFlag("showOriginal", truthy(req.body.showOriginal));
      if (req.body.allowDownload!= null) setFlag("allowDownload",truthy(req.body.allowDownload));
      if (req.body.highlight    != null) setFlag("highlight",    truthy(req.body.highlight));
      if (req.body.background   != null) setFlag("background",   req.body.background);
      if (req.body.deferOCRUntilRelease != null) {
        const v = truthy(req.body.deferOCRUntilRelease);
        setFlag("deferOCRUntilRelease", v);
        setFlag("ocrAtRelease", v);
      }

      // new files (tolerate any field name)
      const incoming = collectIncomingFiles(req);
      const toStore = async (f) =>
        storeBuffer({
          buffer: f.buffer,
          filename: f.originalname || f.fieldname,
          mime: f.mimetype || "application/octet-stream",
        });
      const pushFile = (kind, payload, mime) =>
        doc.files.push({ kind, url: payload.url, mime: mime || "" });

      for (const f of incoming.images) { try { pushFile("image", await toStore(f), f.mimetype); } catch {} }
      for (const f of incoming.pdf)    { try { pushFile("pdf",   await toStore(f), f.mimetype); } catch {} }
      for (const f of incoming.audio)  { try { pushFile("audio", await toStore(f), f.mimetype); } catch {} }
      for (const f of incoming.video)  { try { pushFile("video", await toStore(f), f.mimetype); } catch {} }

      // optional re-OCR now
      if (truthy(req.body.reOCR) && doc.flags.extractOCR && !doc.flags.ocrAtRelease && !doc.text) {
        const first = incoming.images[0] || incoming.pdf[0];
        if (first?.buffer?.length) doc.ocrText = await runOcrSafe(first.buffer);
      }

      await doc.save();
      res.json({ success: true, item: doc });
    } catch (e) {
      console.error("[prep] patch template failed:", e);
      res.status(500).json({ success: false, error: e?.message || "server error" });
    }
  }
);

// Delete module (admin)
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

  // fetch all for this day, then split released vs upcoming (today)
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

    if (isReleased) {
      released.push(m);
    } else {
      if (rel && rel.toDateString() === now2.toDateString()) {
        upcomingToday.push({
          _id: m._id,
          title: m.title || "Untitled",
          releaseAt: rel,
        });
      }
    }
  }

  // Lazy OCR after release
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
      } catch (e) {
        // swallow; non-fatal
      }
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

/* --------- NEW: optional /user/today alias so the 404 goes away --------- */
router.get("/user/today", async (req, res) => {
  // Return the same "released modules" as summary, but include full items array
  const { examId, email } = req.query || {};
  if (!examId) return res.status(400).json({ success: false, error: "examId required" });

  // reuse logic above
  const now = new Date();
  let access = null;
  if (email) access = await PrepAccess.findOne({ examId, userEmail: email, status: "active" }).lean();
  const planDays = access?.planDays || 3;
  const startAt  = access?.startAt || now;
  const dayIdx   = Math.max(1, Math.min(planDays, Math.floor((now - new Date(startAt)) / 86400000) + 1));

  const all = await PrepModule.find({ examId, dayIndex: dayIdx }).sort({ releaseAt: 1, slotMin: 1 }).lean();
  const items = all.filter(m => !m.releaseAt || new Date(m.releaseAt) <= now || m.status === "released");
  res.json({ success: true, items });
});

/* ================= Light "cron" to flip scheduled → released ================= */

// Every minute: release any scheduled modules whose time has arrived.
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
