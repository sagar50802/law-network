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

/* ------------------ helpers ------------------ */

// memory upload (max 40 MB)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 40 * 1024 * 1024 } });

// truthy helper
function truthy(v) {
  return ["true", "1", "on", "yes"].includes(String(v).trim().toLowerCase());
}

function safeName(filename = "file") {
  return String(filename).replace(/\s+/g, "_").replace(/[^\w.\-]/g, "");
}

// optional R2
let R2 = null;
try { R2 = await import("../utils/r2.js"); } catch { R2 = null; }

function grid(bucket) {
  const db = mongoose.connection?.db;
  if (!db) return null;
  return new mongoose.mongo.GridFSBucket(db, { bucketName: bucket });
}

// store buffer (R2 first, then GridFS)
async function storeBuffer({ buffer, filename, mime, bucket = "prep" }) {
  const name = safeName(filename || "file");
  const contentType = mime || "application/octet-stream";

  // Try Cloudflare R2 first
  try {
    const enabled = R2 && (typeof R2.r2Enabled === "function" ? R2.r2Enabled() : !!R2.r2Enabled);
    if (enabled && typeof R2.uploadBuffer === "function") {
      // IMPORTANT: r2.js uploadBuffer(key, buffer, contentType)
      const key = `${bucket}/${name}`;
      const url = await R2.uploadBuffer(key, buffer, contentType);
      return { url, via: "r2" };
    }
  } catch (e) {
    console.warn("[prep] R2 upload failed → fallback to GridFS:", e?.message || e);
  }

  // Fallback to GridFS
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

/* ------------------ Exams ------------------ */

router.get("/exams", async (_req, res) => {
  const exams = await PrepExam.find({}).sort({ name: 1 }).lean();
  res.set("Cache-Control", "no-store");
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
  res.set("Cache-Control", "no-store");
  res.json({ success: true, exam: doc });
});

/* ------------------ Templates ------------------ */

router.get("/templates", async (req, res) => {
  const { examId } = req.query || {};
  if (!examId) return res.status(400).json({ success: false, error: "examId required" });
  const items = await PrepModule.find({ examId }).sort({ dayIndex: 1, slotMin: 1 }).lean();
  res.set("Cache-Control", "no-store");
  res.json({ success: true, items });
});

/** Accept files even if field names mismatch */
function collectIncomingFiles(req) {
  const out = {
    images: [].concat(req.files?.images || []),
    pdf:    [].concat(req.files?.pdf    || []),
    audio:  [].concat(req.files?.audio  || []),
    video:  [].concat(req.files?.video  || []),
  };

  // If upload.any() populated req.files as an array, accept common alternates
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

// POST /templates  (multer first, then fallback to any(), then admin check)
router.post(
  "/templates",
  (req, res, next) => upload.fields([
    { name: "images", maxCount: 12 },
    { name: "pdf",    maxCount: 1  },
    { name: "audio",  maxCount: 1  },
    { name: "video",  maxCount: 1  },
  ])(req, res, (err) => {
    if (err) return next(err);
    if (!req.files || (Object.keys(req.files).length === 0)) {
      return upload.any()(req, res, next);
    }
    next();
  }),
  isAdmin,
  async (req, res) => {
    try {
      const {
        examId,
        dayIndex,
        slotMin = 0,
        title = "",
        releaseAt,
        manualText = "",
        extractOCR,
        showOriginal,
        allowDownload,
        highlight,
        background,
      } = req.body || {};

      if (!examId || !dayIndex) {
        return res.status(400).json({ success: false, error: "examId & dayIndex required" });
      }

      const incoming = collectIncomingFiles(req);
      const files = [];
      const toStore = async (f) =>
        storeBuffer({
          buffer: f.buffer,
          filename: f.originalname || f.fieldname,
          mime: f.mimetype || "application/octet-stream",
        });
      const add = (kind, payload, mime) => files.push({ kind, url: payload.url, mime: mime || "" });

      for (const f of incoming.images) { try { add("image", await toStore(f), f.mimetype); } catch {} }
      if (incoming.pdf[0])   { try { add("pdf",   await toStore(incoming.pdf[0]),   incoming.pdf[0].mimetype); } catch {} }
      if (incoming.audio[0]) { try { add("audio", await toStore(incoming.audio[0]), incoming.audio[0].mimetype); } catch {} }
      if (incoming.video[0]) { try { add("video", await toStore(incoming.video[0]), incoming.video[0].mimetype); } catch {} }

      const relAt = releaseAt ? new Date(releaseAt) : null;
      const status = relAt && relAt > new Date() ? "scheduled" : "released";

      const doc = await PrepModule.create({
        examId,
        dayIndex: Number(dayIndex),
        slotMin: Number(slotMin || 0),
        title,
        text: manualText,
        files,
        flags: {
          extractOCR: truthy(extractOCR),
          showOriginal: truthy(showOriginal),
          allowDownload: truthy(allowDownload),
          highlight: truthy(highlight),
          background,
        },
        releaseAt: relAt || undefined,
        status,
      });

      res.set("Cache-Control", "no-store");
      return res.json({ success: true, item: doc });
    } catch (e) {
      console.error("[prep] create template failed:", e);
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

/* ------------------ User endpoints ------------------ */

// meta: todayDay + planDays for the user (cohort-style if access exists)
router.get("/user/summary", async (req, res) => {
  const { examId, email } = req.query || {};
  if (!examId) return res.status(400).json({ success: false, error: "examId required" });

  let access = null;
  if (email) {
    access = await PrepAccess.findOne({ examId, userEmail: email, status: "active" }).lean();
  }

  const now = new Date();
  const planDays = access?.planDays || (await PrepModule.find({ examId }).distinct("dayIndex")).length || 1;
  const startAt  = access?.startAt || now;
  const todayDay = Math.max(1, Math.min(planDays, Math.floor((now - new Date(startAt)) / 86400000) + 1));

  res.set("Cache-Control", "no-store");
  res.json({ success: true, planDays, todayDay });
});

// all modules for today's dayIndex (released + scheduled)
// client filters/reorders and shows “Coming later today”
router.get("/user/today", async (req, res) => {
  const { examId, email } = req.query || {};
  if (!examId) return res.status(400).json({ success: false, error: "examId required" });

  let access = null;
  if (email) {
    access = await PrepAccess.findOne({ examId, userEmail: email, status: "active" }).lean();
  }

  const now = new Date();
  const planDays = access?.planDays || (await PrepModule.find({ examId }).distinct("dayIndex")).length || 1;
  const startAt  = access?.startAt || now;
  const todayDay = Math.max(1, Math.min(planDays, Math.floor((now - new Date(startAt)) / 86400000) + 1));

  const items = await PrepModule
    .find({ examId, dayIndex: todayDay })
    .sort({ releaseAt: 1, slotMin: 1 })
    .lean();

  res.set("Cache-Control", "no-store");
  res.json({ success: true, items });
});

// mark complete (kept)
router.post("/user/complete", async (req, res) => {
  const { examId, email, dayIndex } = req.body || {};
  if (!examId || !email || !dayIndex)
    return res.status(400).json({ success: false, error: "examId, email, dayIndex required" });

  const doc = await PrepProgress.findOneAndUpdate(
    { examId, email, dayIndex },
    { $set: { done: true, completedAt: new Date() } },
    { upsert: true, new: true }
  );
  res.json({ success: true, progress: doc });
});

/* ------------------ Auto-release ------------------ */

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
