import express from "express";
import multer from "multer";
import mongoose from "mongoose";
import { isAdmin } from "./utils.js";

import PrepExam from "../models/PrepExam.js";
import PrepModule from "../models/PrepModule.js";
import PrepAccess from "../models/PrepAccess.js";
import PrepProgress from "../models/PrepProgress.js";

// ✅ NEW: Import shared config getter for Option A sync
import { getConfig } from "../routes/prep_access.js"; // adjust path if needed

const router = express.Router();

/* ───────────────────────── Upload (Multer) ───────────────────────── */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 40 * 1024 * 1024, // 40 MB per file
    files: 16,
    fields: 200,
    fieldSize: 5 * 1024 * 1024,
  },
});

function safeName(filename = "file") {
  return String(filename).replace(/\s+/g, "_").replace(/[^\w.\-]/g, "");
}

/* ───────────────────────── Optional Cloudflare R2 helper ───────────────────────── */
let R2 = null;
try {
  R2 = await import("../utils/r2.js");
} catch {
  R2 = null;
}

function grid(bucket) {
  const db = mongoose.connection?.db;
  if (!db) return null;
  return new mongoose.mongo.GridFSBucket(db, { bucketName: bucket });
}

async function storeBuffer({ buffer, filename, mime, bucket = "prep" }) {
  const name = safeName(filename || "file");
  const contentType = mime || "application/octet-stream";

  // Try R2 first
  if (R2?.r2Enabled?.() && typeof R2.uploadBuffer === "function") {
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

/* ───────────────────────── Helpers ───────────────────────── */
function truthy(v) {
  return ["true", "1", "on", "yes"].includes(String(v).trim().toLowerCase());
}

async function planDaysForExam(examId) {
  const days = await PrepModule.find({ examId }).distinct("dayIndex");
  if (!days.length) return 1;
  return Math.max(...days.map(Number).filter(Number.isFinite));
}

function dayIndexFrom(startAt, now = new Date()) {
  return Math.max(1, Math.floor((now - new Date(startAt)) / 86400000) + 1);
}

/* ───────────────────────── Access Approval Model ───────────────────────── */
let PrepAccessGrant;
try {
  PrepAccessGrant = mongoose.model("PrepAccessGrant");
} catch {
  const grantSchema = new mongoose.Schema({
    examId: String,
    email: { type: String, lowercase: true, trim: true },
    status: { type: String, default: "active", enum: ["active", "revoked"] },
    grantedAt: Date,
    revokedAt: Date,
  });
  PrepAccessGrant = mongoose.model("PrepAccessGrant", grantSchema);
}

function normExamId(s) { return String(s || "").trim(); }
function normEmail(s) { return String(s || "").trim().toLowerCase(); }

/* ───────────────────────── Overlay Computation ───────────────────────── */
function computeOverlayAt(exam, access) {
  if (!exam?.overlay || exam.overlay.mode === "never") {
    return { openAt: null, planTimeShow: false };
  }
  const mode = exam.overlay.mode;
  if (mode === "planDayTime") {
    const tz = exam.overlay.tz || "Asia/Kolkata";
    const showOnDay = Number(exam.overlay.showOnDay ?? 1);
    const showAtLocal = String(exam.overlay.showAtLocal || "09:00");
    const startAt = access?.startAt ? new Date(access.startAt) : null;
    if (!startAt) return { openAt: null, planTimeShow: false };
    const now = new Date();
    const todayDay = Math.max(1, Math.floor((now - startAt) / 86400000) + 1);
    const [hh, mm] = showAtLocal.split(":").map((x) => parseInt(x, 10) || 0);
    const reached = now.getHours() > hh || (now.getHours() === hh && now.getMinutes() >= mm);
    return { openAt: null, planTimeShow: todayDay >= showOnDay && reached };
  }
  if (mode === "fixed-date") {
    const dt = exam.overlay.fixedAt ? new Date(exam.overlay.fixedAt) : null;
    return { openAt: dt && !isNaN(+dt) ? dt : null, planTimeShow: false };
  }
  const base = access?.startAt ? new Date(access.startAt) : new Date();
  const days = Number(exam.overlay.offsetDays ?? 3);
  return { openAt: new Date(+base + days * 86400000), planTimeShow: false };
}

/* ───────────────────────── Access Payload Builder ───────────────────────── */
async function buildAccessStatusPayload(examId, email) {
  const exam = await PrepExam.findOne({ examId }).lean();
  if (!exam) {
    return { success: true, exam: null, access: { status: "none" }, overlay: {}, serverNow: Date.now() };
  }

  const planDays = await planDaysForExam(examId);

  const access = email ? await PrepAccess.findOne({ examId, userEmail: email }).lean() : null;
  const grant = (email
    ? await PrepAccessGrant.findOne({
        examId: new RegExp(`^${normExamId(examId)}$`, "i"),
        email: normEmail(email),
        status: "active",
      }).lean()
    : null);

  let status = access?.status || "none";
  let startAt = access?.startAt ? new Date(access.startAt) : null;
  if (!startAt && grant) {
    status = "active";
    startAt = grant.grantedAt ? new Date(grant.grantedAt) : null;
  }

  const todayDay = startAt ? Math.min(planDays, dayIndexFrom(startAt)) : 1;
  const trialDays = Number(exam?.trialDays ?? 0);
  const canRestart = status === "active" && todayDay >= planDays;

  const { openAt, planTimeShow } = computeOverlayAt(exam, { startAt });
  const pay = exam?.overlay?.payment || {};

  const overlay = {
    show: false,
    mode: exam?.overlay?.mode || "planDayTime",
    openAt: openAt ? openAt.toISOString() : null,
    tz: exam?.overlay?.tz || "Asia/Kolkata",
    payment: {
      courseName: exam?.name || String(examId),
      priceINR: Number(exam?.price || 0),
      upiId: pay.upiId || "",
      upiName: pay.upiName || "",
      whatsappNumber: pay.whatsappNumber || "",
      whatsappText: pay.whatsappText || "",
    },
    planTimeShow,
  };

  return {
    success: true,
    exam: { examId: exam.examId, name: exam.name, price: exam.price, overlay: exam.overlay },
    access: { status, planDays, todayDay, canRestart, startAt: startAt || null, trialDays },
    overlay,
    serverNow: Date.now(),
  };
}

/* ───────────────────────── Exams CRUD ───────────────────────── */
router.get("/exams", async (_req, res) => {
  const exams = await PrepExam.find({}, { examId: 1, name: 1 }).sort({ name: 1 }).lean();
  res.json({ success: true, exams });
});

router.post("/exams", isAdmin, async (req, res) => {
  try {
    const { examId, name, scheduleMode = "cohort" } = req.body || {};
    if (!examId || !name)
      return res.status(400).json({ success: false, error: "examId & name required" });

    const doc = await PrepExam.findOneAndUpdate(
      { examId },
      { $set: { name, scheduleMode } },
      { upsert: true, new: true }
    );
    res.json({ success: true, exam: doc });
  } catch (e) {
    console.error("[POST /exams] error:", e);
    res.status(500).json({ success: false, message: e.message || "Unexpected server error" });
  }
});

router.delete("/exams/:examId", isAdmin, async (req, res) => {
  try {
    const examId = req.params.examId;
    if (!examId)
      return res.status(400).json({ success: false, error: "examId required" });
    const r1 = await PrepModule.deleteMany({ examId });
    const r2 = await PrepAccess.deleteMany({ examId });
    const r3 = await PrepProgress.deleteMany({ examId });
    const r4 = await PrepExam.deleteOne({ examId });
    res.json({
      success: true,
      removed: {
        modules: r1.deletedCount,
        access: r2.deletedCount,
        progress: r3.deletedCount,
        exams: r4.deletedCount,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e?.message || "server error" });
  }
});

/* ───────────────────────── Overlay Config ───────────────────────── */
router.patch("/exams/:examId/overlay-config", isAdmin, async (req, res) => {
  try {
    const examId = req.params.examId;
    const b = req.body || {};
    if (!examId) return res.status(400).json({ success: false, error: "Missing examId" });

    const update = {
      price: Number(b.price || 0),
      trialDays: Number(b.trialDays || 0),
      overlay: {
        mode: b.mode || "planDayTime",
        offsetDays: Number(b.offsetDays || 0),
        fixedAt: b.fixedAt ? new Date(b.fixedAt) : undefined,
        showOnDay: Number(b.showOnDay || 1),
        showAtLocal: b.showAtLocal || "09:00",
        payment: {
          upiId: String(b.upiId || b.payment?.upiId || ""),
          upiName: String(b.upiName || b.payment?.upiName || ""),
          whatsappNumber: String(b.whatsappNumber || b.payment?.whatsappNumber || ""),
          whatsappText: String(b.whatsappText || b.payment?.whatsappText || ""),
        },
      },
    };

    const doc = await PrepExam.findOneAndUpdate(
      { examId },
      { $set: update },
      { new: true, upsert: false }
    );

    if (!doc) return res.status(404).json({ success: false, error: "Exam not found" });
    res.json({ success: true, exam: doc });
  } catch (e) {
    console.error("[PATCH overlay-config] error:", e);
    res.status(500).json({ success: false, error: e.message || "Server error" });
  }
});

/* ───────────────────────── Exam Meta Fetch (Enhanced with prep_access Config) ───────────────────────── */
router.get("/exams/:examId/meta", isAdmin, async (req, res) => {
  try {
    const examId = req.params.examId;
    const exam = await PrepExam.findOne({
      examId: new RegExp(`^${String(examId).trim()}$`, "i"),
    }).lean();
    if (!exam) return res.status(404).json({ success: false, error: "Exam not found" });

    const totalModules = await PrepModule.countDocuments({
      examId: new RegExp(`^${String(examId).trim()}$`, "i"),
    });
    const days = await PrepModule.find({
      examId: new RegExp(`^${String(examId).trim()}$`, "i"),
    }).distinct("dayIndex");

    // ✅ NEW: Merge prep_access.js global config (Option A)
    const globalCfg = await getConfig();
    const payment = {
      priceINR: Number(globalCfg.priceINR || exam.price || 0),
      upiId: globalCfg.upiId || exam.overlay?.payment?.upiId || "",
      upiName: globalCfg.upiName || exam.overlay?.payment?.upiName || "",
      whatsappNumber:
        globalCfg.whatsappNumber || exam.overlay?.payment?.whatsappNumber || "",
      whatsappText:
        globalCfg.whatsappText || exam.overlay?.payment?.whatsappText || "",
    };

    res.json({
      success: true,
      exam: {
        examId: exam.examId,
        name: exam.name,
        price: payment.priceINR,
        totalModules,
        totalDays: days.length,
        overlay: { payment },
      },
    });
  } catch (e) {
    console.error("[GET /prep/exams/:examId/meta] error:", e);
    res.status(500).json({ success: false, error: e.message || "server error" });
  }
});

/* ───────────────────────── Templates (Modules) — R2 Enabled ───────────────────────── */
const fieldsUpload = upload.fields([
  { name: "images", maxCount: 12 },
  { name: "pdf", maxCount: 1 },
  { name: "audio", maxCount: 1 },
  { name: "video", maxCount: 1 },
]);

router.post("/templates", isAdmin, (req, res, next) => {
  const ctype = req.headers["content-type"] || "";
  if (!ctype.includes("multipart/form-data")) {
    req.files = {};
    return next();
  }

  fieldsUpload(req, res, function (err) {
    if (!err) return next();
    if (err instanceof multer.MulterError) {
      const map = {
        LIMIT_FILE_SIZE: "One of the files is too large (max 40 MB each).",
        LIMIT_PART_COUNT: "Too many parts in form.",
        LIMIT_FILE_COUNT: "Too many files.",
        LIMIT_FIELD_KEY: "Field name too long.",
        LIMIT_FIELD_VALUE: "A field value is too long.",
        LIMIT_FIELD_COUNT: "Too many fields.",
        LIMIT_UNEXPECTED_FILE: "Unexpected file field.",
      };
      const msg = map[err.code] || `Upload error: ${err.message}`;
      return res.status(400).json({ success: false, error: msg, code: err.code });
    }
    if (err && /Unexpected end of form/i.test(err.message)) {
      return res.status(400).json({
        success: false,
        error: "Incomplete form submission — please try again.",
      });
    }
    return res.status(400).json({ success: false, error: err.message || "Upload failed" });
  });
}, async (req, res) => {
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
      content,
    } = req.body || {};

    if (!examId || !dayIndex)
      return res.status(400).json({ success: false, error: "examId & dayIndex required" });

    const useR2 = R2?.r2Enabled?.();
    const files = [];

    async function saveFile(f) {
      const name = f.originalname || f.fieldname;
      const mime = f.mimetype || "application/octet-stream";
      const buffer = f.buffer;
      if (useR2 && typeof R2.uploadBuffer === "function") {
        const key = `prep/${safeName(name)}`;
        const url = await R2.uploadBuffer(key, buffer, mime);
        return { url, via: "r2" };
      }
      return await storeBuffer({ buffer, filename: name, mime });
    }

    const groups = [
      ["images", "image"],
      ["pdf", "pdf"],
      ["audio", "audio"],
      ["video", "video"],
    ];

    for (const [field, kind] of groups) {
      if (req.files?.[field]) {
        for (const f of req.files[field]) {
          const s = await saveFile(f);
          files.push({ kind, url: s.url, mime: f.mimetype });
        }
      }
    }

    const manualOrPasted = (manualText || content || "").trim();
    const relAt = releaseAt ? new Date(releaseAt) : null;
    const status = relAt && relAt > new Date() ? "scheduled" : "released";

    const doc = await PrepModule.create({
      examId,
      dayIndex: Number(dayIndex),
      slotMin: Number(slotMin),
      title,
      text: manualOrPasted,
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

    res.json({
      success: true,
      item: { ...doc.toObject(), files },
      message: `Uploaded ${files.length} file(s) via ${useR2 ? "R2" : "GridFS"}`,
   ... });
  } catch (e) {
    console.error("[prep/templates] create failed:", e);
    res.status(500).json({ success: false, error: e?.message || "server error" });
  }
});

/* ───────── Fetch Existing Templates ───────── */
router.get("/templates", isAdmin, async (req, res) => {
  try {
    const { examId } = req.query;
    if (!examId) {
      return res.status(400).json({ success: false, error: "examId required" });
    }

    const modules = await PrepModule.find({
      examId: new RegExp(`^${String(examId).trim()}$`, "i"),
    })
      .sort({ dayIndex: 1, slotMin: 1 })
      .lean();

    // Return both keys for compatibility
    res.json({ success: true, modules, items: modules });
  } catch (e) {
    console.error("[GET /prep/templates] error:", e);
    res.status(500).json({ success: false, error: e.message || "server error" });
  }
});

/* ───────────────────────── Delete Template ───────────────────────── */
router.delete("/templates/:id", isAdmin, async (req, res) => {
  try {
    const r = await PrepModule.findByIdAndDelete(req.params.id);
    if (!r) return res.status(404).json({ success: false, error: "Not found" });
    res.json({ success: true, removed: r._id });
  } catch (e) {
    res.status(500).json({ success: false, error: e?.message || "server error" });
  }
});

/* ───────────────────────── Global Error Guard ───────────────────────── */
router.use((err, _req, res, _next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ success: false, error: err.message, code: err.code });
  }
  if (err) {
    console.error("[prep] unhandled error:", err);
    return res
      .status(err.status || 500)
      .json({ success: false, error: err.message || "server error" });
  }
  res.status(404).json({ success: false, error: "Not found" });
});

console.log("✅ prep.js routes registered successfully");

export default router;
