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

// universal store buffer
async function storeBuffer({ buffer, filename, mime, bucket = "prep" }) {
  const name = safeName(filename || "file");
  const contentType = mime || "application/octet-stream";

  // Try Cloudflare R2 first
  if (R2 && typeof R2.r2Enabled === "function" && R2.r2Enabled() && typeof R2.uploadBuffer === "function") {
    try {
      const key = `${bucket}/${name}`;
      const url = await R2.uploadBuffer(key, buffer, contentType);
      return { url, via: "r2" };
    } catch (e) {
      console.warn("[prep] R2 upload failed → fallback to GridFS:", e.message);
    }
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

/* ------------------ Templates ------------------ */

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
    { name: "pdf", maxCount: 1 },
    { name: "audio", maxCount: 1 },
    { name: "video", maxCount: 1 },
  ]),
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

      if (!examId || !dayIndex)
        return res.status(400).json({ success: false, error: "examId & dayIndex required" });

      const files = [];
      const toStore = async (f) =>
        storeBuffer({
          buffer: f.buffer,
          filename: f.originalname || f.fieldname,
          mime: f.mimetype || "application/octet-stream",
        });

      // sequential storage
      if (req.files?.images) {
        for (const f of req.files.images) {
          const s = await toStore(f);
          files.push({ kind: "image", url: s.url, mime: f.mimetype });
        }
      }
      if (req.files?.pdf?.[0]) {
        const f = req.files.pdf[0];
        const s = await toStore(f);
        files.push({ kind: "pdf", url: s.url, mime: f.mimetype });
      }
      if (req.files?.audio?.[0]) {
        const f = req.files.audio[0];
        const s = await toStore(f);
        files.push({ kind: "audio", url: s.url, mime: f.mimetype });
      }
      if (req.files?.video?.[0]) {
        const f = req.files.video[0];
        const s = await toStore(f);
        files.push({ kind: "video", url: s.url, mime: f.mimetype });
      }

      const relAt = releaseAt ? new Date(releaseAt) : null;
      const status = relAt && relAt > new Date() ? "scheduled" : "released";

      const doc = await PrepModule.create({
        examId,
        dayIndex: Number(dayIndex),
        slotMin: Number(slotMin),
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

      console.log("[prep] created:", { examId, title, files: files.length, status });

      if (!doc?._id) {
        console.error("[prep] failed to create module properly");
        return res.status(500).json({ success: false, error: "Document not created" });
      }

      return res.json({ success: true, item: doc });
    } catch (e) {
      console.error("[prep] create template failed:", e);
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

/* ------------------ User endpoints ------------------ */

router.get("/user/summary", async (req, res) => {
  const { examId } = req.query || {};
  if (!examId) return res.status(400).json({ success: false, error: "examId required" });

  const maxDay = await PrepModule.find({ examId }).distinct("dayIndex");
  const planDays = maxDay.length ? Math.max(...maxDay.map(Number)) : 1;
  const todayDay = 1;

  res.json({ success: true, planDays, todayDay });
});

router.get("/user/today", async (req, res) => {
  const { examId } = req.query || {};
  if (!examId) return res.status(400).json({ success: false, error: "examId required" });

  const items = await PrepModule.find({ examId }).sort({ dayIndex: 1, slotMin: 1 }).lean();
  res.json({ success: true, items });
});

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
    console.warn("[prep] auto-release failed:", e.message);
  }
}, 60_000);

export default router;
