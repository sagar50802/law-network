import express from "express";
import multer from "multer";
import mongoose from "mongoose";
import { isAdmin } from "./utils.js";
import PrepExam from "../models/PrepExam.js";
import PrepModule from "../models/PrepModule.js";
import PrepAccess from "../models/PrepAccess.js";
import PrepProgress from "../models/PrepProgress.js";

const router = express.Router();

// 40 MB per file, memory storage (your existing behavior)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 40 * 1024 * 1024 },
});

// -------- Optional R2 + GridFS fallback ----------
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

/**
 * Store a buffer:
 * 1) Try R2 if enabled
 * 2) If that throws or disabled, fallback to GridFS
 */
async function storeBuffer({ buffer, filename, mime, bucket = "prep" }) {
  const safefn = safeName(filename || "file");
  const contentType = mime || "application/octet-stream";

  // Prefer R2 if it looks enabled, but never crash if it fails—fallback to GridFS
  if (R2?.r2Enabled?.() && R2?.uploadBuffer) {
    try {
      const url = await R2.uploadBuffer(buffer, safefn, contentType);
      return { url, via: "r2" };
    } catch (e) {
      console.warn("[prep] R2 upload failed, falling back to GridFS:", e?.message || e);
    }
  }

  // ---- GridFS fallback ----
  const g = grid(bucket);
  if (!g) throw Object.assign(new Error("DB not connected"), { status: 503 });

  const id = await new Promise((resolve, reject) => {
    const ws = g.openUploadStream(safefn, { contentType });
    ws.on("error", reject);
    ws.on("finish", () => resolve(ws.id));
    ws.end(buffer);
  });

  return { url: `/api/files/${bucket}/${String(id)}`, via: "gridfs" };
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

// ==================== Exams ====================

// List exams (public)
router.get("/exams", async (_req, res) => {
  const exams = await PrepExam.find({}).sort({ name: 1 }).lean();
  res.json({ success: true, exams });
});

// Create exam (admin)
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

// List templates for an exam
router.get("/templates", async (req, res) => {
  const { examId } = req.query;
  if (!examId) return res.status(400).json({ success: false, error: "examId required" });
  const items = await PrepModule.find({ examId }).sort({ dayIndex: 1, slotMin: 1 }).lean();
  res.json({ success: true, items });
});

// Create/attach module (admin)
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
        examId,
        dayIndex,
        slotMin = 0,
        title = "",
        description = "",
        extractOCR = "false",
        showOriginal = "false",
        allowDownload = "false",
        highlight = "false",
        background = "",
      } = req.body || {};

      if (!examId || !dayIndex) {
        return res.status(400).json({ success: false, error: "examId & dayIndex required" });
      }

      const files = [];
      const addFile = (kind, payload) => {
        files.push({ kind, url: payload.url, mime: payload.mime || payload.mimetype || "" });
      };

      const toStore = async (f) => {
        if (!f?.buffer?.length) throw new Error("empty file buffer");
        return storeBuffer({
          buffer: f.buffer,
          filename: f.originalname || f.fieldname,
          mime: f.mimetype || "application/octet-stream",
        });
      };

      // ---- store uploads (skip bad files instead of crashing) ----
      for (const f of req.files?.images || []) {
        try { addFile("image", { ...(await toStore(f)), mime: f.mimetype }); }
        catch (e) { console.warn("[prep] image store failed:", e?.message || e); }
      }
      if (req.files?.pdf?.[0]) {
        const f = req.files.pdf[0];
        try { addFile("pdf",   { ...(await toStore(f)), mime: f.mimetype }); }
        catch (e) { console.warn("[prep] pdf store failed:", e?.message || e); }
      }
      if (req.files?.audio?.[0]) {
        const f = req.files.audio[0];
        try { addFile("audio", { ...(await toStore(f)), mime: f.mimetype }); }
        catch (e) { console.warn("[prep] audio store failed:", e?.message || e); }
      }
      if (req.files?.video?.[0]) {
        const f = req.files.video[0];
        try { addFile("video", { ...(await toStore(f)), mime: f.mimetype }); }
        catch (e) { console.warn("[prep] video store failed:", e?.message || e); }
      }

      // ---- OCR (first image or pdf) ----
      let ocrText = "";
      const wantOCR = String(extractOCR) === "true";
      if (wantOCR && (req.files?.images?.[0] || req.files?.pdf?.[0])) {
        const src = req.files.images?.[0] || req.files.pdf?.[0];
        ocrText = await runOcrSafe(src?.buffer);
      }

      const flags = {
        extractOCR: wantOCR,
        showOriginal: String(showOriginal) === "true",
        allowDownload: String(allowDownload) === "true",
        highlight: String(highlight) === "true",
        background,
      };

      const doc = await PrepModule.create({
        examId,
        dayIndex: Number(dayIndex),
        slotMin: Number(slotMin || 0),
        title,
        description,
        files,
        flags,
        ocrText,
        status: "released", // cohort mode
      });

      res.json({ success: true, item: doc });
    } catch (e) {
      console.error("[prep] POST /templates failed:", e);
      res.status(500).json({ success: false, error: e?.message || "server error" });
    }
  }
);

// Update flags / re-OCR / add more files (admin)
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

      const setFlag = (k, v) => { doc.flags[k] = v; };

      // basic fields
      if (req.body.title        != null) doc.title        = req.body.title;
      if (req.body.description  != null) doc.description  = req.body.description;
      if (req.body.dayIndex     != null) doc.dayIndex     = Number(req.body.dayIndex);
      if (req.body.slotMin      != null) doc.slotMin      = Number(req.body.slotMin);

      // flags
      if (req.body.extractOCR   != null) setFlag("extractOCR",  String(req.body.extractOCR)  === "true");
      if (req.body.showOriginal != null) setFlag("showOriginal", String(req.body.showOriginal)=== "true");
      if (req.body.allowDownload!= null) setFlag("allowDownload",String(req.body.allowDownload)=== "true");
      if (req.body.highlight    != null) setFlag("highlight",   String(req.body.highlight)   === "true");
      if (req.body.background   != null) setFlag("background",  req.body.background);

      // more files
      const toStore = async (f) => storeBuffer({
        buffer: f.buffer,
        filename: f.originalname || f.fieldname,
        mime: f.mimetype || "application/octet-stream",
      });
      const pushFile = (kind, payload) => doc.files.push({ kind, url: payload.url, mime: payload.mimetype || "" });

      for (const f of req.files?.images || []) {
        try { pushFile("image", { ...(await toStore(f)), mimetype: f.mimetype }); }
        catch (e) { console.warn("[prep] image append failed:", e?.message || e); }
      }
      if (req.files?.pdf?.[0]) {
        const f = req.files.pdf[0];
        try { pushFile("pdf",   { ...(await toStore(f)), mimetype: f.mimetype }); }
        catch (e) { console.warn("[prep] pdf append failed:", e?.message || e); }
      }
      if (req.files?.audio?.[0]) {
        const f = req.files.audio[0];
        try { pushFile("audio", { ...(await toStore(f)), mimetype: f.mimetype }); }
        catch (e) { console.warn("[prep] audio append failed:", e?.message || e); }
      }
      if (req.files?.video?.[0]) {
        const f = req.files.video[0];
        try { pushFile("video", { ...(await toStore(f)), mimetype: f.mimetype }); }
        catch (e) { console.warn("[prep] video append failed:", e?.message || e); }
      }

      // optional re-OCR (if turned on)
      if (String(req.body.reOCR || "false") === "true" && doc.flags.extractOCR) {
        const uploaded = (req.files?.images?.[0] || req.files?.pdf?.[0])?.buffer;
        if (uploaded) {
          doc.ocrText = await runOcrSafe(uploaded);
        }
      }

      await doc.save();
      res.json({ success: true, item: doc });
    } catch (e) {
      console.error("[prep] PATCH /templates/:id failed:", e);
      res.status(500).json({ success: false, error: e?.message || "server error" });
    }
  }
);

// ==================== Access (cohort) ====================

// Grant (admin)
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

// User summary (today day + modules)
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

  const modules = await PrepModule
    .find({ examId, dayIndex: dayIdx })
    .sort({ slotMin: 1 })
    .lean();

  res.json({ success: true, todayDay: dayIdx, planDays, modules });
});

// Mark complete day
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
