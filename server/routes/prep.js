import express from "express";
import multer from "multer";
import mongoose from "mongoose";
import { isAdmin } from "./utils.js";
import PrepExam from "../models/PrepExam.js";
import PrepModule from "../models/PrepModule.js";
import PrepAccess from "../models/PrepAccess.js";
import PrepProgress from "../models/PrepProgress.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 40 * 1024 * 1024 } });

// -------- R2 (optional) + GridFS fallback ----------
let R2 = null;
try { R2 = await import("../utils/r2.js"); } catch { R2 = null; }

function grid(bucket) {
  const db = mongoose.connection?.db;
  if (!db) return null;
  return new mongoose.mongo.GridFSBucket(db, { bucketName: bucket });
}

async function storeBuffer({ buffer, filename, mime, bucket = "prep" }) {
  // Prefer R2 if available
  if (R2?.r2Enabled?.() && R2?.uploadBuffer) {
    const url = await R2.uploadBuffer(buffer, filename, mime);
    return { url, via: "r2" };
  }
  // Fallback: GridFS
  const g = grid(bucket);
  if (!g) throw Object.assign(new Error("DB not connected"), { status: 503 });
  const safe = String(filename || "file").replace(/\s+/g, "_").replace(/[^\w.\-]/g, "");
  const id = await new Promise((res, rej) => {
    const ws = g.openUploadStream(safe, { contentType: mime || "application/octet-stream" });
    ws.on("error", rej);
    ws.on("finish", () => res(ws.id));
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
    if (OCR?.runOCR) return await OCR.runOCR(buffer, "eng+hin");
    return "";
  } catch { return ""; }
}

// ========== Exams ==========

// List exams (public)
router.get("/exams", async (_req, res) => {
  const exams = await PrepExam.find({}).sort({ name: 1 }).lean();
  res.json({ success: true, exams });
});

// Create exam (admin)
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

// ========== Modules (templates) ==========

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
    { name: "pdf", maxCount: 1 },
    { name: "audio", maxCount: 1 },
    { name: "video", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const {
        examId, dayIndex, slotMin = 0, title = "", description = "",
        extractOCR = "false", showOriginal = "false", allowDownload = "false",
        highlight = "false", background = ""
      } = req.body || {};
      if (!examId || !dayIndex) {
        return res.status(400).json({ success: false, error: "examId & dayIndex required" });
      }

      const files = [];
      const addFile = (kind, f) => files.push({ kind, url: f.url, mime: f.mime || f.mimetype || "" });

      const toStore = async (f) => storeBuffer({
        buffer: f.buffer,
        filename: f.originalname || f.fieldname,
        mime: f.mimetype || "application/octet-stream",
      });

      // store uploads
      for (const f of req.files?.images || []) {
        const saved = await toStore(f);
        addFile("image", { ...f, url: saved.url });
      }
      if (req.files?.pdf?.[0]) {
        const saved = await toStore(req.files.pdf[0]);
        addFile("pdf", { ...req.files.pdf[0], url: saved.url });
      }
      if (req.files?.audio?.[0]) {
        const saved = await toStore(req.files.audio[0]);
        addFile("audio", { ...req.files.audio[0], url: saved.url });
      }
      if (req.files?.video?.[0]) {
        const saved = await toStore(req.files.video[0]);
        addFile("video", { ...req.files.video[0], url: saved.url });
      }

      // OCR once (if enabled, prefer first image/pdf buffer)
      let ocrText = "";
      const wantOCR = String(extractOCR) === "true";
      if (wantOCR && (req.files?.images?.[0] || req.files?.pdf?.[0])) {
        const src = req.files?.images?.[0] || req.files?.pdf?.[0];
        ocrText = await runOcrSafe(src.buffer);
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
      res.status(500).json({ success: false, error: e.message });
    }
  }
);

// Update flags / re-OCR / add more files (admin)
router.patch(
  "/templates/:id",
  isAdmin,
  upload.fields([
    { name: "images", maxCount: 12 },
    { name: "pdf", maxCount: 1 },
    { name: "audio", maxCount: 1 },
    { name: "video", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const doc = await PrepModule.findById(req.params.id);
      if (!doc) return res.status(404).json({ success: false, error: "Not found" });

      const patch = {};
      const setFlags = (k, v) => (doc.flags[k] = v);

      // flags/fields
      if (req.body.title != null) doc.title = req.body.title;
      if (req.body.description != null) doc.description = req.body.description;
      if (req.body.dayIndex != null) doc.dayIndex = Number(req.body.dayIndex);
      if (req.body.slotMin != null) doc.slotMin = Number(req.body.slotMin);

      if (req.body.extractOCR != null) setFlags("extractOCR", String(req.body.extractOCR) === "true");
      if (req.body.showOriginal != null) setFlags("showOriginal", String(req.body.showOriginal) === "true");
      if (req.body.allowDownload != null) setFlags("allowDownload", String(req.body.allowDownload) === "true");
      if (req.body.highlight != null) setFlags("highlight", String(req.body.highlight) === "true");
      if (req.body.background != null) setFlags("background", req.body.background);

      // new files
      const addFile = (kind, f) => doc.files.push({ kind, url: f.url, mime: f.mimetype || "" });
      const toStore = async (f) => storeBuffer({
        buffer: f.buffer, filename: f.originalname || f.fieldname, mime: f.mimetype || "application/octet-stream"
      });

      for (const f of req.files?.images || []) addFile("image", { ...f, url: (await toStore(f)).url });
      if (req.files?.pdf?.[0]) addFile("pdf", { ...req.files.pdf[0], url: (await toStore(req.files.pdf[0])).url });
      if (req.files?.audio?.[0]) addFile("audio", { ...req.files.audio[0], url: (await toStore(req.files.audio[0])).url });
      if (req.files?.video?.[0]) addFile("video", { ...req.files.video[0], url: (await toStore(req.files.video[0])).url });

      // optional re-OCR
      if (String(req.body.reOCR || "false") === "true" && doc.flags.extractOCR) {
        // Prefer latest uploaded image/pdf if any; else first existing
        let buf = null;
        const uploaded = (req.files?.images?.[0] || req.files?.pdf?.[0])?.buffer;
        if (uploaded) buf = uploaded;
        if (!buf) {
          // try to fetch first existing resource if it’s a gridfs URL (skip to keep simple)
          buf = null;
        }
        if (buf) doc.ocrText = await runOcrSafe(buf);
      }

      await doc.save();
      res.json({ success: true, item: doc, patch });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  }
);

// ========== Access (cohort) ==========

// Grant (admin)
router.post("/access/grant", isAdmin, async (req, res) => {
  const { userEmail, examId, planDays = 30, startAt } = req.body || {};
  if (!userEmail || !examId) return res.status(400).json({ success: false, error: "userEmail & examId required" });
  const start = startAt ? new Date(startAt) : new Date();
  const expiry = new Date(start.getTime() + Number(planDays) * 86400000);
  // archive old
  await PrepAccess.updateMany({ userEmail, examId, status: "active" }, { $set: { status: "archived" } });
  const access = await PrepAccess.create({ userEmail, examId, planDays: Number(planDays), startAt: start, expiryAt: expiry, status: "active" });
  // reset progress
  await PrepProgress.findOneAndUpdate({ userEmail, examId }, { $set: { completedDays: [] } }, { upsert: true, new: true });
  res.json({ success: true, access });
});

// User summary (today day + modules)
router.get("/user/summary", async (req, res) => {
  const { examId, email } = req.query || {};
  if (!examId) return res.status(400).json({ success: false, error: "examId required" });

  // find active access (if no email provided, treat as preview with planDays 3)
  let access = null;
  if (email) {
    access = await PrepAccess.findOne({ examId, userEmail: email, status: "active" }).lean();
  }
  const now = new Date();
  const planDays = access?.planDays || 3;
  const startAt = access?.startAt || now;
  const dayIdx = Math.max(1, Math.min(planDays, Math.floor((now - new Date(startAt)) / 86400000) + 1));

  // fetch all modules for this day
  const modules = await PrepModule.find({ examId, dayIndex: dayIdx }).sort({ slotMin: 1 }).lean();

  res.json({ success: true, todayDay: dayIdx, planDays, modules });
});

// Mark complete day
router.post("/user/complete", async (req, res) => {
  const { examId, email, dayIndex } = req.body || {};
  if (!examId || !email || !dayIndex) return res.status(400).json({ success: false, error: "examId, email, dayIndex required" });
  const doc = await PrepProgress.findOneAndUpdate(
    { userEmail: email, examId },
    { $addToSet: { completedDays: Number(dayIndex) } },
    { upsert: true, new: true }
  );
  res.json({ success: true, progress: doc });
});

export default router;
