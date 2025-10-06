// server/routes/prep.js
import express from "express";
import multer from "multer";
import mongoose from "mongoose";
import cron from "node-cron";
import { isAdmin } from "./utils.js";
import PrepExam from "../models/PrepExam.js";
import PrepModule from "../models/PrepModule.js";
import PrepAccess from "../models/PrepAccess.js";
import PrepProgress from "../models/PrepProgress.js";

const router = express.Router();

// 40 MB per file, memory storage
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 40 * 1024 * 1024 },
});

// -------- R2 (optional) + GridFS fallback ----------
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

/** browser checkbox helper */
function truthy(v) {
  return ["true", "1", "on", "yes"].includes(String(v).trim().toLowerCase());
}

/** Store a buffer, prefer R2, fallback to GridFS */
async function storeBuffer({ buffer, filename, mime, bucket = "prep" }) {
  const safefn = safeName(filename || "file");
  const contentType = mime || "application/octet-stream";

  if (R2?.r2Enabled?.() && R2?.uploadBuffer) {
    try {
      const url = await R2.uploadBuffer(buffer, safefn, contentType);
      return { url, via: "r2", mimetype: contentType };
    } catch (e) {
      console.warn("[prep] R2 upload failed, falling back to GridFS:", e?.message || e);
    }
  }

  const g = grid(bucket);
  if (!g) throw Object.assign(new Error("DB not connected"), { status: 503 });

  const id = await new Promise((resolve, reject) => {
    const ws = g.openUploadStream(safefn, { contentType });
    ws.on("error", reject);
    ws.on("finish", () => resolve(ws.id));
    ws.end(buffer);
  });

  return { url: `/api/files/${bucket}/${String(id)}`, via: "gridfs", mimetype: contentType };
}

// -------- OCR helper (graceful) ----------
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

/** Re-read a stored file into a Buffer for scheduled OCR */
async function fetchBufferForFile(file) {
  if (!file?.url) return null;

  // A) GridFS path: /api/files/<bucket>/<id>
  const m = String(file.url).match(/^\/api\/files\/([^/]+)\/([a-f0-9]{24,})/i);
  if (m) {
    const [_, bucket, objId] = m;
    const g = grid(bucket);
    if (!g) return null;
    const id = new mongoose.Types.ObjectId(objId);
    const chunks = [];
    return await new Promise((res, rej) => {
      g.openDownloadStream(id)
        .on("data", (d) => chunks.push(d))
        .on("error", rej)
        .on("end", () => res(Buffer.concat(chunks)));
    });
  }

  // B) R2/public URL
  const absolute = /^https?:\/\//i.test(file.url)
    ? file.url
    : ((process.env.PUBLIC_FILE_BASE || process.env.VITE_API_URL || process.env.CLIENT_URL || "").replace(/\/+$/, "") + file.url);

  try {
    const nf = (await import("node-fetch")).default;
    const r = await nf(absolute);
    if (!r.ok) return null;
    const arr = new Uint8Array(await r.arrayBuffer());
    return Buffer.from(arr);
  } catch {
    return null;
  }
}

// ==================== Exams ====================

router.get("/exams", async (_req, res) => {
  const exams = await PrepExam.find({}).sort({ name: 1 }).lean();
  res.json({ success: true, exams });
});

router.post("/exams", isAdmin, async (req, res) => {
  const { examId, name, scheduleMode = "cohort" } = req.body || {};
  if (!examId || !name) {
    return res.status(400).json({ success: false, error: "examId & name required" });
  }
  const doc = await PrepExam.findOneAndUpdate(
    { examId },
    { $set: { name, scheduleMode } },
    { upsert: true, new: true }
  );
  res.json({ success: true, exam: doc });
});

// ==================== Modules (templates) ====================

/**
 * List templates for an exam
 * Includes both released and scheduled so Admin sees everything.
 * User endpoints will filter.
 */
router.get("/templates", async (req, res) => {
  const { examId } = req.query;
  if (!examId) return res.status(400).json({ success: false, error: "examId required" });
  const items = await PrepModule.find({ examId })
    .sort({ dayIndex: 1, slotMin: 1, releaseAt: 1 })
    .lean();
  res.json({ success: true, items });
});

/**
 * Create/attach module (admin) with optional scheduling and manual text.
 * If releaseAt provided => status = "scheduled" (OCR deferred to release time).
 * If releaseAt missing => status = "released" (OCR runs now if asked).
 */
router.post(
  "/templates",
  isAdmin,
  upload.fields([
    { name: "images", maxCount: 24 },
    { name: "pdf",    maxCount: 1  },
    { name: "audio",  maxCount: 1  },
    { name: "video",  maxCount: 1  },
  ]),
  async (req, res) => {
    try {
      const {
        examId,
        dayIndex,
        slotMin = 0,
        title = "",
        description = "",
        extractOCR,
        showOriginal,
        allowDownload,
        highlight,
        background = "",
        text = "",            // <-- NEW: manual text paste
        releaseAt = "",       // <-- NEW: schedule ISO / datetime-local
      } = req.body || {};

      if (!examId || !dayIndex) {
        return res.status(400).json({ success: false, error: "examId & dayIndex required" });
      }

      const files = [];
      const add = (kind, payload) => files.push({ kind, url: payload.url, mime: payload.mimetype || payload.mime || "" });

      const toStore = async (f) => {
        if (!f?.buffer?.length) throw new Error("empty file buffer");
        return storeBuffer({
          buffer: f.buffer,
          filename: f.originalname || f.fieldname,
          mime: f.mimetype || "application/octet-stream",
        });
      };

      // store uploads (skip on per-file failure)
      for (const f of req.files?.images || []) {
        try { add("image", await toStore(f)); } catch (e) { console.warn("[prep] image save:", e?.message || e); }
      }
      if (req.files?.pdf?.[0])   { try { add("pdf",   await toStore(req.files.pdf[0])); }   catch (e) { console.warn("[prep] pdf save:", e?.message || e); } }
      if (req.files?.audio?.[0]) { try { add("audio", await toStore(req.files.audio[0])); } catch (e) { console.warn("[prep] audio save:", e?.message || e); } }
      if (req.files?.video?.[0]) { try { add("video", await toStore(req.files.video[0])); } catch (e) { console.warn("[prep] video save:", e?.message || e); } }

      const flags = {
        extractOCR: truthy(extractOCR),
        showOriginal: truthy(showOriginal),
        allowDownload: truthy(allowDownload),
        highlight: truthy(highlight),
        background,
      };

      // If a releaseAt is provided, schedule it; else release now.
      const hasSchedule = Boolean(releaseAt);
      const relAt = hasSchedule ? new Date(releaseAt) : null;
      let ocrText = "";

      // Manual text always wins (admin pasted text)
      if (text && String(text).trim()) {
        ocrText = String(text).trim();
      } else if (!hasSchedule && flags.extractOCR) {
        // No schedule => run OCR now (first image OR pdf)
        const firstUpload = (req.files?.images?.[0] || req.files?.pdf?.[0])?.buffer;
        if (firstUpload) ocrText = await runOcrSafe(firstUpload);
      }

      const doc = await PrepModule.create({
        examId,
        dayIndex: Number(dayIndex),
        slotMin: Number(slotMin || 0),
        title,
        description,
        files,
        flags,
        ocrText,
        status: hasSchedule ? "scheduled" : "released",
        releaseAt: hasSchedule ? relAt : null,
      });

      res.json({ success: true, item: doc });
    } catch (e) {
      console.error("[prep] POST /templates failed:", e);
      res.status(500).json({ success: false, error: e?.message || "server error" });
    }
  }
);

/** Update fields / flags / files / schedule / re-OCR */
router.patch(
  "/templates/:id",
  isAdmin,
  upload.fields([
    { name: "images", maxCount: 24 },
    { name: "pdf",    maxCount: 1  },
    { name: "audio",  maxCount: 1  },
    { name: "video",  maxCount: 1  },
  ]),
  async (req, res) => {
    try {
      const doc = await PrepModule.findById(req.params.id);
      if (!doc) return res.status(404).json({ success: false, error: "Not found" });

      const setFlag = (k, v) => { doc.flags[k] = v; };

      // basic fields
      if (req.body.title        != null) doc.title        = req.body.title;
      if (req.body.description  != null) doc.description  = req.body.description;
      if (req.body.dayIndex     != null) doc.dayIndex     = Number(req.body.dayIndex);
      if (req.body.slotMin      != null) doc.slotMin      = Number(req.body.slotMin);

      // manual text can replace ocrText
      if (req.body.text != null) {
        const txt = String(req.body.text || "").trim();
        if (txt) doc.ocrText = txt;
      }

      // flags
      if (req.body.extractOCR   != null) setFlag("extractOCR",  truthy(req.body.extractOCR));
      if (req.body.showOriginal != null) setFlag("showOriginal", truthy(req.body.showOriginal));
      if (req.body.allowDownload!= null) setFlag("allowDownload",truthy(req.body.allowDownload));
      if (req.body.highlight    != null) setFlag("highlight",   truthy(req.body.highlight));
      if (req.body.background   != null) setFlag("background",  req.body.background);

      // schedule
      if (req.body.releaseAt != null) {
        const ra = String(req.body.releaseAt).trim();
        if (ra) {
          doc.releaseAt = new Date(ra);
          if (doc.status !== "released") doc.status = "scheduled";
        } else {
          // clear schedule (release immediately)
          doc.releaseAt = null;
          if (doc.status !== "released") doc.status = "released";
        }
      }

      // more files
      const toStore = async (f) => storeBuffer({
        buffer: f.buffer,
        filename: f.originalname || f.fieldname,
        mime: f.mimetype || "application/octet-stream",
      });
      const pushFile = (kind, payload) => doc.files.push({ kind, url: payload.url, mime: payload.mimetype || payload.mime || "" });

      for (const f of req.files?.images || []) { try { pushFile("image", await toStore(f)); } catch (e) {} }
      if (req.files?.pdf?.[0])   { try { pushFile("pdf",   await toStore(req.files.pdf[0])); }   catch (e) {} }
      if (req.files?.audio?.[0]) { try { pushFile("audio", await toStore(req.files.audio[0])); } catch (e) {} }
      if (req.files?.video?.[0]) { try { pushFile("video", await toStore(req.files.video[0])); } catch (e) {} }

      // optional re-OCR (if turned on and requested)
      if (truthy(req.body.reOCR) && doc.flags.extractOCR) {
        // Prefer newly uploaded images/pdf; else skip (defer to schedule if any)
        const uploaded = (req.files?.images?.[0] || req.files?.pdf?.[0])?.buffer;
        if (uploaded) doc.ocrText = await runOcrSafe(uploaded);
      }

      await doc.save();
      res.json({ success: true, item: doc });
    } catch (e) {
      console.error("[prep] PATCH /templates/:id failed:", e);
      res.status(500).json({ success: false, error: e?.message || "server error" });
    }
  }
);

/** NEW: Delete a module */
router.delete("/templates/:id", isAdmin, async (req, res) => {
  const ok = await PrepModule.deleteOne({ _id: req.params.id });
  res.json({ success: true, deleted: ok.deletedCount });
});

// ==================== Access (cohort) ====================

router.post("/access/grant", isAdmin, async (req, res) => {
  const { userEmail, examId, planDays = 30, startAt } = req.body || {};
  if (!userEmail || !examId) {
    return res.status(400).json({ success: false, error: "userEmail & examId required" });
  }
  const start  = startAt ? new Date(startAt) : new Date();
  const expiry = new Date(start.getTime() + Number(planDays) * 86400000);

  await PrepAccess.updateMany(
    { userEmail, examId, status: "active" },
    { $set: { status: "archived" } }
  );

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

/**
 * User summary (today):
 * - released modules for todayDay
 * - upcoming (scheduled) modules for the same day with times
 */
router.get("/user/summary", async (req, res) => {
  const { examId, email } = req.query || {};
  if (!examId) return res.status(400).json({ success: false, error: "examId required" });

  let access = null;
  if (email) {
    access = await PrepAccess.findOne({ examId, userEmail: email, status: "active" }).lean();
  }

  const now      = new Date();
  const planDays = access?.planDays || 3;
  const startAt  = access?.startAt || now;
  const dayIdx   = Math.max(1, Math.min(
    planDays,
    Math.floor((now - new Date(startAt)) / 86400000) + 1
  ));

  // Released content for today
  const released = await PrepModule
    .find({ examId, dayIndex: dayIdx, status: "released" })
    .sort({ slotMin: 1, releaseAt: 1 })
    .lean();

  // Upcoming (same day) – show to users as “coming soon”
  const upcoming = await PrepModule
    .find({ examId, dayIndex: dayIdx, status: "scheduled" })
    .select("title releaseAt slotMin")
    .sort({ releaseAt: 1, slotMin: 1 })
    .lean();

  res.json({ success: true, todayDay: dayIdx, planDays, modules: released, upcoming });
});

router.post("/user/complete", async (req, res) => {
  const { examId, email, dayIndex } = req.body || {};
  if (!examId || !email || !dayIndex) {
    return res.status(400).json({ success: false, error: "examId, email, dayIndex required" });
  }
  const doc = await PrepProgress.findOneAndUpdate(
    { userEmail: email, examId },
    { $addToSet: { completedDays: Number(dayIndex) } },
    { upsert: true, new: true }
  );
  res.json({ success: true, progress: doc });
});

export default router;

/* ==================== CRON: Promote scheduled -> released ====================

Runs every minute:
- Pick modules with status 'scheduled' whose releaseAt <= now
- If extractOCR = true and no ocrText yet, run OCR once (pdf/image)
- Mark as 'released'

This keeps server.js untouched—cron starts when this file is imported.
*/
cron.schedule("*/1 * * * *", async () => {
  const now = new Date();
  const due = await PrepModule.find({ status: "scheduled", releaseAt: { $lte: now } }).limit(10);
  if (!due.length) return;

  console.log(`[prep] promoting ${due.length} scheduled module(s) @ ${now.toISOString()}`);
  for (const doc of due) {
    try {
      if (doc.flags?.extractOCR && !doc.ocrText) {
        // prefer image; else pdf
        const first = (doc.files || []).find(f => f.kind === "image")
                  || (doc.files || []).find(f => f.kind === "pdf");
        const buf = await fetchBufferForFile(first);
        if (buf) doc.ocrText = await runOcrSafe(buf);
      }
      doc.status = "released";
      await doc.save();
    } catch (e) {
      console.warn("[prep] promote failed:", doc._id?.toString(), e?.message || e);
    }
  }
});
