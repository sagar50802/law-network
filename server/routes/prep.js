// ---------------------------------------------------------------------------
// LawNetwork Prep Routes — Exams, Modules, Access, and Progress
// ---------------------------------------------------------------------------

import express from "express";
import multer from "multer";
import mongoose from "mongoose";
// ---- SAFE pdf-parse import (avoids test/demo entry) -----------------------
let pdfParse = null;
try {
  // Preferred: import the library entry directly
  pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
} catch {
  try {
    // Fallback: normal entry
    pdfParse = (await import("pdf-parse")).default;
  } catch {
    pdfParse = null;
    console.warn("[prep] pdf-parse not available; PDF OCR disabled");
  }
}
import { isAdmin } from "./utils.js";
import PrepExam from "../models/PrepExam.js";
import PrepModule from "../models/PrepModule.js";
import PrepAccess from "../models/PrepAccess.js";
import PrepProgress from "../models/PrepProgress.js";

const router = express.Router();

/* -------------------------------------------------------------------------- */
/*                              Helper utilities                              */
/* -------------------------------------------------------------------------- */

// Memory upload (max 40 MB per file)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 40 * 1024 * 1024 },
});

// Parse “truthy” strings like "on", "true", etc.
function truthy(v) {
  return ["true", "1", "on", "yes"].includes(String(v).trim().toLowerCase());
}

// Safe filename for R2/GridFS
function safeName(filename = "file") {
  return String(filename).replace(/\s+/g, "_").replace(/[^\w.\-]/g, "");
}

// Optional R2 import
let R2 = null;
try {
  R2 = await import("../utils/r2.js");
} catch {
  R2 = null;
}

// GridFS bucket
function grid(bucket) {
  const db = mongoose.connection?.db;
  if (!db) return null;
  return new mongoose.mongo.GridFSBucket(db, { bucketName: bucket });
}

/**
 * Store buffer to R2 (if configured) else GridFS.
 * Returns { url, via }
 */
async function storeBuffer({ buffer, filename, mime, bucket = "prep" }) {
  const name = safeName(filename || "file");
  const contentType = mime || "application/octet-stream";

  // Try Cloudflare R2 first
  if (
    R2 &&
    typeof R2.r2Enabled === "function" &&
    R2.r2Enabled() &&
    typeof R2.uploadBuffer === "function"
  ) {
    try {
      const key = `${bucket}/${name}`;
      const url = await R2.uploadBuffer(key, buffer, contentType);
      return { url, via: "r2" };
    } catch (e) {
      console.warn("[prep] R2 upload failed → fallback to GridFS:", e.message);
    }
  }

  // Fallback → GridFS
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

/* -------------------- OCR helpers (PDF now, images later) ------------------- */

async function tryPdfText(buf) {
  if (!pdfParse) return "";
  try {
    const out = await pdfParse(buf);
    return (out.text || "").trim();
  } catch (e) {
    console.warn("[prep] pdf-parse failed:", e.message);
    return "";
  }
}

/** Prefer manual/pasted text; else OCR from uploaded PDF when requested. */
async function computeBestText({ body, files }) {
  const manual = (body?.manualText || "").trim();
  if (manual) return manual;

  const pasted = (body?.content || "").trim();
  if (pasted) return pasted;

  if (truthy(body?.extractOCR) && files?.pdf?.[0]?.buffer) {
    const t = await tryPdfText(files.pdf[0].buffer);
    if (t) return t;
  }
  return "";
}

/* -------------------------------------------------------------------------- */
/*                                    Exams                                   */
/* -------------------------------------------------------------------------- */

router.get("/exams", async (_req, res) => {
  const exams = await PrepExam.find({}).sort({ name: 1 }).lean();
  res.json({ success: true, exams });
});

router.post("/exams", isAdmin, async (req, res) => {
  const { examId, name, scheduleMode = "cohort" } = req.body || {};
  if (!examId || !name)
    return res
      .status(400)
      .json({ success: false, error: "examId & name required" });

  const doc = await PrepExam.findOneAndUpdate(
    { examId },
    { $set: { name, scheduleMode } },
    { upsert: true, new: true }
  );
  res.json({ success: true, exam: doc });
});

// Delete an exam and related records (modules/access/progress)
router.delete("/exams/:examId", isAdmin, async (req, res) => {
  try {
    const examId = req.params.examId;
    if (!examId) return res.status(400).json({ success: false, error: "examId required" });

    const r1 = await PrepModule.deleteMany({ examId });
    const r2 = await PrepAccess.deleteMany({ examId });
    const r3 = await PrepProgress.deleteMany({ examId });
    const r4 = await PrepExam.deleteOne({ examId });

    res.json({
      success: true,
      removed: { modules: r1.deletedCount, access: r2.deletedCount, progress: r3.deletedCount, exams: r4.deletedCount }
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e?.message || "server error" });
  }
});

/* -------------------------------------------------------------------------- */
/*                                  Templates                                 */
/* -------------------------------------------------------------------------- */

// GET all templates for an exam
router.get("/templates", async (req, res) => {
  const { examId } = req.query || {};
  if (!examId)
    return res
      .status(400)
      .json({ success: false, error: "examId required" });

  const items = await PrepModule.find({ examId })
    .sort({ dayIndex: 1, slotMin: 1 })
    .lean();
  res.json({ success: true, items });
});

// POST create new module template (admin)
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

      if (!examId || !dayIndex) {
        return res
          .status(400)
          .json({ success: false, error: "examId & dayIndex required" });
      }

      const files = [];
      const toStore = async (f) =>
        storeBuffer({
          buffer: f.buffer,
          filename: f.originalname || f.fieldname,
          mime: f.mimetype || "application/octet-stream",
        });

      // Sequential upload to ensure order
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

      // Best-effort text (manual/pasted/OCR)
      const bestText = await computeBestText({ body: req.body, files: req.files });

      const relAt = releaseAt ? new Date(releaseAt) : null;
      const status =
        relAt && relAt > new Date() ? "scheduled" : "released";

      const doc = await PrepModule.create({
        examId,
        dayIndex: Number(dayIndex),
        slotMin: Number(slotMin),
        title,
        text: bestText || manualText,
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

      console.log("[prep] created:", {
        examId,
        title,
        count: files.length,
        status,
        ocr: truthy(extractOCR) ? (bestText ? "ok" : "none") : "off",
      });

      if (!doc?._id) {
        console.error("[prep] failed to create module properly");
        return res
          .status(500)
          .json({ success: false, error: "Document not created" });
      }

      res.setHeader("Content-Type", "application/json");
      return res.json({
        success: true,
        item: {
          ...doc.toObject(),
          files,
          message: `Uploaded ${files.length} file(s) successfully.`,
        },
      });
    } catch (e) {
      console.error("[prep] create template failed:", e);
      res
        .status(500)
        .json({ success: false, error: e?.message || "server error" });
    }
  }
);

// DELETE a module
router.delete("/templates/:id", isAdmin, async (req, res) => {
  try {
    const r = await PrepModule.findByIdAndDelete(req.params.id);
    if (!r)
      return res
        .status(404)
        .json({ success: false, error: "Not found" });
    res.json({ success: true, removed: r._id });
  } catch (e) {
    res
      .status(500)
      .json({ success: false, error: e?.message || "server error" });
  }
});

/* -------------------------------------------------------------------------- */
/*                               User endpoints                               */
/* -------------------------------------------------------------------------- */

// Helper: compute "todayDay" for an exam/user (clamped to planDays)
async function computeTodayDay(examId, email) {
  const now = new Date();

  // Try active access (preferred)
  const access = email
    ? await PrepAccess.findOne({ examId, userEmail: email, status: "active" }).lean()
    : null;

  // Determine planDays to clamp against:
  let planDays = 1;
  if (access?.planDays) {
    planDays = Number(access.planDays) || 1;
  } else {
    // Fallback to highest day index defined for the exam
    const days = await PrepModule.find({ examId }).distinct("dayIndex");
    planDays = days.length ? Math.max(...days.map(Number)) : 1;
  }

  // If no access, default to Day 1
  if (!access) return 1;

  const start = new Date(access.startAt || now);
  const dayIndex = Math.floor((now - start) / 86400000) + 1;
  return Math.max(1, Math.min(planDays, dayIndex));
}

// Summary (planDays, todayDay)
router.get("/user/summary", async (req, res) => {
  const { examId, email } = req.query || {};
  if (!examId)
    return res
      .status(400)
      .json({ success: false, error: "examId required" });

  const planDays = (await PrepModule.find({ examId }).distinct("dayIndex"))
    .map(Number)
    .filter(Number.isFinite)
    .reduce((m, v) => Math.max(m, v), 1);

  const todayDay = await computeTodayDay(examId, email);

  res.json({ success: true, planDays, todayDay });
});

// Today's modules (released + scheduled for that day)
router.get("/user/today", async (req, res) => {
  const { examId, email } = req.query || {};
  if (!examId)
    return res
      .status(400)
      .json({ success: false, error: "examId required" });

  const day = await computeTodayDay(examId, email);

  const items = await PrepModule.find({ examId, dayIndex: day })
    .sort({ releaseAt: 1, slotMin: 1 })
    .lean();

  res.json({ success: true, items, todayDay: day });
});

// Mark completion
router.post("/user/complete", async (req, res) => {
  const { examId, email, dayIndex } = req.body || {};
  if (!examId || !email || !dayIndex)
    return res
      .status(400)
      .json({
        success: false,
        error: "examId, email, dayIndex required",
      });

  const doc = await PrepProgress.findOneAndUpdate(
    { examId, email, dayIndex },
    { $set: { done: true, completedAt: new Date() } },
    { upsert: true, new: true }
  );
  res.json({ success: true, progress: doc });
});

/* -------------------------------------------------------------------------- */
/*                               Auto-release loop                            */
/* -------------------------------------------------------------------------- */

setInterval(async () => {
  try {
    const now = new Date();
    const r = await PrepModule.updateMany(
      { status: "scheduled", releaseAt: { $lte: now } },
      { $set: { status: "released" } }
    );
    if (r?.modifiedCount)
      console.log(
        `[prep] auto-released ${r.modifiedCount} module(s) at ${now.toISOString()}`
      );

    // OCR-at-release for PDFs with extractOCR flag but empty text (tiny batch)
    const candidates = await PrepModule.find({
      status: "released",
      $or: [{ text: { $exists: false } }, { text: "" }],
      "flags.extractOCR": true,
      files: { $elemMatch: { kind: "pdf" } },
    }).limit(3).lean();

    for (const m of candidates) {
      try {
        const pdf = (m.files || []).find((f) => f.kind === "pdf" && f.url);
        if (!pdf || typeof fetch !== "function") continue;
        const resp = await fetch(pdf.url);
        if (!resp.ok) continue;
        const ab = await resp.arrayBuffer();
        const buf = Buffer.from(ab);
        const t = await tryPdfText(buf);
        if (t) {
          await PrepModule.updateOne({ _id: m._id }, { $set: { text: t } });
          console.log("[prep] OCR@release ok:", m._id.toString());
        }
      } catch (e) {
        console.warn("[prep] OCR@release failed:", m._id?.toString(), e.message);
      }
    }
  } catch (e) {
    console.warn("[prep] auto-release failed:", e.message);
  }
}, 60_000);

/* -------------------------------------------------------------------------- */

export default router;
