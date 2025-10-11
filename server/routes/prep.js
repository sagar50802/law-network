// ---------------------------------------------------------------------------
// LawNetwork Prep Routes — Exams, Modules, Access, and Progress
// ---------------------------------------------------------------------------

import express from "express";
import multer from "multer";
import mongoose from "mongoose";
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

/* -------------------------------------------------------------------------- */
/*                       PDF text extraction helpers                          */
/* -------------------------------------------------------------------------- */
/** Existing pdfjs-dist (legacy build) extractor (kept) */
let pdfjsLib = null;
async function extractPdfText(buf) {
  try {
    if (!pdfjsLib) {
      const mod = await import("pdfjs-dist/legacy/build/pdf.js");
      pdfjsLib = mod;
    }
    const loadingTask = pdfjsLib.getDocument({
      data: buf instanceof Buffer ? new Uint8Array(buf) : buf,
      disableWorker: true,
      isEvalSupported: false,
    });
    const doc = await loadingTask.promise;
    const out = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const tc = await page.getTextContent({ normalizeWhitespace: true });
      out.push(
        tc.items
          .map((it) => (it.str || "").replace(/\s+/g, " ").trim())
          .filter(Boolean)
          .join(" ")
      );
      await page.cleanup();
    }
    await doc.cleanup();
    return out.join("\n\n").trim();
  } catch (e) {
    console.warn("[prep] PDF extract (pdfjs) failed:", e.message);
    return "";
  }
}

/** Safe pdf-parse import (avoids demo/test file path issue) */
let pdfParse = null;
try {
  pdfParse = (await import("pdf-parse/lib/pdf-parse.js")).default;
} catch {
  try {
    pdfParse = (await import("pdf-parse")).default;
  } catch {
    pdfParse = null;
    console.warn("[prep] pdf-parse not available; using pdfjs only");
  }
}

async function tryPdfParse(buf) {
  if (!pdfParse) return "";
  try {
    const out = await pdfParse(buf);
    return (out?.text || "").trim();
  } catch (e) {
    console.warn("[prep] pdf-parse failed:", e.message);
    return "";
  }
}

/** Dual extractor: try pdf-parse first, fallback to pdfjs-dist */
async function extractPdfTextDual(buf) {
  const a = await tryPdfParse(buf);
  if (a) return a;
  return await extractPdfText(buf);
}

/* -------------------- Small text helper (manual/pasted) -------------------- */
/** Keep ‘text’ for admin-provided content; OCR text is saved separately */
function bestManualText(body) {
  const manual = (body?.manualText || "").trim();
  if (manual) return manual;
  const pasted = (body?.content || "").trim();
  if (pasted) return pasted;
  return "";
}

/* ---------------------- Absolute URL helper for fetch ---------------------- */
const PUBLIC_BASE =
  process.env.APP_BASE_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  process.env.PUBLIC_BASE_URL ||
  "";

function toAbs(u) {
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  if (!PUBLIC_BASE) return "";
  return `${PUBLIC_BASE.replace(/\/+$/,"")}${u.startsWith("/") ? "" : "/"}${u}`;
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

/* ─────────────── NEW: Overlay Config (GET/POST) for Admin panel ───────────── */

// GET current overlay config for an exam (and mirror price/trialDays)
router.get("/exams/:examId/overlay-config", async (req, res) => {
  try {
    const { examId } = req.params;
    const exam = await PrepExam.findOne({ examId }).lean();

    const overlay = exam?.overlay || {
      mode: "planDayTime",      // 'planDayTime' | 'afterN' | 'fixed' | 'never'
      showOnDay: 1,
      showAtLocal: "09:00",     // HH:mm (local)
      daysAfterStart: 0,
      fixedAt: null
    };

    const price = Number(exam?.price ?? 0);
    const trialDays = Number(exam?.trialDays ?? 3);

    res.json({ success: true, examId, price, trialDays, overlay });
  } catch (e) {
    console.error("overlay-config GET error", e);
    res.status(500).json({ success: false, error: "server_error" });
  }
});

/**
 * Save overlay config (expects JSON).
 * Mirrors price/trialDays on exam doc.
 * IMPORTANT: This version PRESERVES overlay.payment unless the caller explicitly sends a payment object.
 */
router.post("/exams/:examId/overlay-config", isAdmin, express.json(), async (req, res) => {
  try {
    const { examId } = req.params;
    const b = req.body || {};

    // Load current exam so we can keep existing overlay.payment if not provided
    const current = await PrepExam.findOne({ examId }).lean();

    const modeList = ["planDayTime", "afterN", "fixed", "never"];
    const nextOverlayCore = {
      mode: modeList.includes(b.mode) ? b.mode : (current?.overlay?.mode || "planDayTime"),
      showOnDay: Number(b.showOnDay ?? current?.overlay?.showOnDay ?? 1),
      showAtLocal: String((b.showAtLocal ?? current?.overlay?.showAtLocal ?? "09:00")).slice(0, 5),
      daysAfterStart: Number(b.daysAfterStart ?? current?.overlay?.daysAfterStart ?? 0),
      fixedAt: (b.fixedAt ?? current?.overlay?.fixedAt) || null
    };

    // If caller sends payment (either overlay.payment or payment), use it; else keep existing.
    const nextPayment =
      (b.overlay && b.overlay.payment) ? b.overlay.payment :
      (b.payment ? b.payment : current?.overlay?.payment);

    const overlay = nextPayment ? { ...nextOverlayCore, payment: nextPayment } : nextOverlayCore;

    const price = Number(b.price ?? current?.price ?? 0);
    const trialDays = Number(b.trialDays ?? current?.trialDays ?? 0);

    await PrepExam.updateOne(
      { examId },
      { $set: { overlay, price, trialDays } },
      { upsert: true }
    );

    res.json({ success: true });
  } catch (e) {
    console.error("overlay-config POST error", e);
    res.status(500).json({ success: false, error: "server_error" });
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

      // Keep the uploaded PDF file object (buffer) for optional extraction
      let uploadedPdf = null;
      if (req.files?.pdf?.[0]) {
        const f = req.files.pdf[0];
        const s = await toStore(f);
        files.push({ kind: "pdf", url: s.url, mime: f.mimetype });
        uploadedPdf = f;
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

      // Text fields:
      const manualOrPasted = bestManualText(req.body);

      // Optional: extract text from uploaded PDF when admin checked "Extract OCR" (dual extractor)
      let ocrText = "";
      if (truthy(extractOCR) && uploadedPdf?.buffer?.length) {
        ocrText = await extractPdfTextDual(uploadedPdf.buffer);
        if (ocrText) {
          console.log(`[prep] PDF text extracted (${ocrText.length} chars)`);
        } else {
          console.log("[prep] PDF text was empty or failed to extract");
        }
      }

      const relAt = releaseAt ? new Date(releaseAt) : null;
      const status =
        relAt && relAt > new Date() ? "scheduled" : "released";

      const doc = await PrepModule.create({
        examId,
        dayIndex: Number(dayIndex),
        slotMin: Number(slotMin),
        title,
        text: manualOrPasted || manualText, // keep 'text' for admin-provided content
        ocrText: ocrText || undefined,      // OCR text saved separately
        files,
        flags: {
          extractOCR: truthy(extractOCR),
          showOriginal: truthy(showOriginal),
          allowDownload: truthy(allowDownload),
          highlight: truthy(highlight),
          background,
          ocrSource: ocrText ? "pdf" : undefined,
        },
        releaseAt: relAt || undefined,
        status,
      });

      console.log("[prep] created:", {
        examId,
        title,
        count: files.length,
        status,
        ocr: truthy(extractOCR) ? (ocrText ? "ok" : "empty") : "off",
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

// Summary (planDays, todayDay) — now computes todayDay using PrepAccess (if present)
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

// Today's modules (for the computed day). Includes released + scheduled for that day.
// The client shows "Coming later" using releaseAt.
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

    // OCR-at-release for PDFs with extractOCR flag but empty ocrText (tiny batch)
    const candidates = await PrepModule.find({
      status: "released",
      $or: [{ ocrText: { $exists: false } }, { ocrText: "" }],
      "flags.extractOCR": true,
      files: { $elemMatch: { kind: "pdf" } },
    })
      .limit(3)
      .lean();

    for (const m of candidates) {
      try {
        const pdf = (m.files || []).find((f) => f.kind === "pdf" && f.url);
        const abs = toAbs(pdf?.url);
        if (!abs) continue; // no absolute base configured

        const resp = await fetch(abs);
        if (!resp.ok) continue;
        const ab = await resp.arrayBuffer();
        const buf = Buffer.from(ab);

        const t = await extractPdfTextDual(buf);
        if (t) {
          await PrepModule.updateOne(
            { _id: m._id },
            { $set: { ocrText: t, "flags.ocrSource": "pdf" } }
          );
          console.log("[prep] OCR@release ok:", m._id.toString(), `(${t.length} chars)`);
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
