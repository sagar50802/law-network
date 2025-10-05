import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs/promises";

import Exam from "../models/Exam.js";
import ModuleTemplate from "../models/ModuleTemplate.js";
import ExamAccess from "../models/ExamAccess.js";
import StudyProgress from "../models/StudyProgress.js";

// ✅ NEW model imports for overlay + intents
import PrepOverlay from "../models/PrepOverlay.js";
import PrepIntent from "../models/PrepIntent.js";

import { putR2, r2Enabled } from "../utils/r2.js";
import { runOCR } from "../utils/ocr.js";
import isOwner from "../middlewares/isOwnerWrapper.js";

const router = express.Router();
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 80 * 1024 * 1024 },
});

/* ---------- helpers ---------- */
const LOCAL_DIR = path.join(process.cwd(), "server", "uploads", "prep");
await fs.mkdir(LOCAL_DIR, { recursive: true }).catch(() => {});

function localSave(name, buf) {
  const p = path.join(LOCAL_DIR, name);
  return fs.writeFile(p, buf).then(() => `/uploads/prep/${name}`);
}
function safeExt(name, fallback) {
  const ext = path.extname(name || "");
  return ext || fallback;
}
function newId() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
}
async function putAny(folder, file) {
  const ext = safeExt(file.originalname, ".bin");
  const key = `${folder}/${Date.now()}_${newId()}${ext}`;
  if (r2Enabled) {
    const url = await putR2({ key, body: file.buffer, contentType: file.mimetype });
    return url;
  }
  const url = await localSave(`${folder}_${Date.now()}_${newId()}${ext}`, file.buffer);
  return url;
}

/* ✅ NEW helper: build UPI deeplink */
function buildUpiDeepLink({ pa, pn, am, tn }) {
  // upi://pay?pa=<id>&pn=<name>&am=<amount>&cu=INR&tn=<note>
  const qs = new URLSearchParams();
  if (pa) qs.set("pa", pa);
  if (pn) qs.set("pn", pn);
  if (am != null) qs.set("am", String(am));
  qs.set("cu", "INR");
  if (tn) qs.set("tn", tn);
  return `upi://pay?${qs.toString()}`;
}

/* ✅ NEW helper: build WhatsApp link */
function buildWhatsappLink(idOrNumber, message) {
  // accepts "9198xxxxxxx" or full "https://wa.me/..." id
  if (!idOrNumber) return "";
  if (/^https?:\/\//i.test(idOrNumber)) return `${idOrNumber}?text=${encodeURIComponent(message || "")}`;
  const num = String(idOrNumber).replace(/[^\d]/g, "");
  return `https://wa.me/${num}?text=${encodeURIComponent(message || "")}`;
}

/* ---------- exams ---------- */
router.get("/exams", async (_req, res) => {
  const exams = await Exam.find({}).sort({ name: 1 }).lean();
  res.json({ success: true, exams });
});

router.post("/exams", isOwner, express.json(), async (req, res) => {
  const { examId, name } = (req.body || {});
  if (!examId || !name) return res.status(400).json({ success: false, message: "examId & name required" });
  const doc = await Exam.findOneAndUpdate(
    { examId },
    { examId, name, scheduleMode: "cohort" },
    { upsert: true, new: true }
  );
  res.json({ success: true, exam: doc });
});

/* ---------- templates (day-wise) ---------- */
// list by exam
router.get("/:examId/templates", async (req, res) => {
  const list = await ModuleTemplate.find({ examId: req.params.examId }).sort({ dayIndex: 1, slotTime: 1 }).lean();
  res.json({ success: true, items: list });
});

// create/attach (multiple files allowed)
router.post(
  "/:examId/templates",
  isOwner,
  upload.fields([{ name: "images", maxCount: 20 }, { name: "pdf", maxCount: 5 }, { name: "audio", maxCount: 5 }]),
  async (req, res) => {
    const { dayIndex, title, slotTime = "09:00" } = req.body || {};
    const flags = {
      extractOCR: String(req.body?.extractOCR) === "true",
      showOriginal: String(req.body?.showOriginal) === "true",
      allowDownload: String(req.body?.allowDownload) === "true",
      highlight: String(req.body?.highlight) === "true",
      background: req.body?.background || "",
    };
    if (!dayIndex) return res.status(400).json({ success: false, message: "dayIndex required" });

    // collect files
    const files = [];
    for (const f of (req.files?.images || [])) files.push({ type: "image", url: await putAny("prep/images", f) });
    for (const f of (req.files?.pdf || [])) files.push({ type: "pdf", url: await putAny("prep/pdfs", f) });
    for (const f of (req.files?.audio || [])) files.push({ type: "audio", url: await putAny("prep/audio", f) });

    // OCR only once if enabled and images/pdf present
    let ocrText = "";
    if (flags.extractOCR) {
      const target = (req.files?.images?.[0] || req.files?.pdf?.[0]) || null;
      if (target?.buffer?.length) {
        try { ocrText = await runOCR(target.buffer); } catch { ocrText = ""; }
      }
    }

    const doc = await ModuleTemplate.findOneAndUpdate(
      { examId: req.params.examId, dayIndex: Number(dayIndex) },
      {
        examId: req.params.examId,
        dayIndex: Number(dayIndex),
        title: title || "Untitled",
        slotTime,
        files,
        ocrText,
        flags,
        status: "scheduled",
      },
      { upsert: true, new: true }
    );
    res.json({ success: true, item: doc });
  }
);

// patch template (replace files or flags)
router.patch(
  "/templates/:id",
  isOwner,
  upload.fields([{ name: "images", maxCount: 20 }, { name: "pdf", maxCount: 5 }, { name: "audio", maxCount: 5 }]),
  async (req, res) => {
    const prev = await ModuleTemplate.findById(req.params.id);
    if (!prev) return res.status(404).json({ success: false, message: "Not found" });

    const patch = {};
    if (req.body.title != null) patch.title = req.body.title;
    if (req.body.slotTime != null) patch.slotTime = req.body.slotTime;

    // flags
    const flags = { ...(prev.flags || {}) };
    ["extractOCR", "showOriginal", "allowDownload", "highlight", "background"].forEach((k) => {
      if (req.body[k] != null) flags[k] = (k === "background") ? req.body[k] : (String(req.body[k]) === "true");
    });
    patch.flags = flags;

    // add any new files to array
    const files = [...(prev.files || [])];
    for (const f of (req.files?.images || [])) files.push({ type: "image", url: await putAny("prep/images", f) });
    for (const f of (req.files?.pdf || [])) files.push({ type: "pdf", url: await putAny("prep/pdfs", f) });
    for (const f of (req.files?.audio || [])) files.push({ type: "audio", url: await putAny("prep/audio", f) });
    patch.files = files;

    // re-OCR if requested explicitly
    if (String(req.body.reOCR) === "true" && flags.extractOCR) {
      const firstImage = req.files?.images?.[0];
      const firstPdf = req.files?.pdf?.[0];
      const target = firstImage || firstPdf || null;
      if (target?.buffer?.length) {
        try { patch.ocrText = await runOCR(target.buffer); } catch {}
      }
    }
    const updated = await ModuleTemplate.findByIdAndUpdate(req.params.id, patch, { new: true });
    res.json({ success: true, item: updated });
  }
);

// delete template
router.delete("/templates/:id", isOwner, async (req, res) => {
  const removed = await ModuleTemplate.findByIdAndDelete(req.params.id);
  res.json({ success: true, removed });
});

/* ---------- access (grant/revoke) ---------- */
router.post("/access/grant", isOwner, express.json(), async (req, res) => {
  const { email, examId, planDays = 30, startAt } = req.body || {};
  if (!email || !examId) return res.status(400).json({ success: false, message: "email & examId required" });

  const start = startAt ? new Date(startAt) : new Date();
  const expiry = new Date(start.getTime() + Number(planDays) * 86400 * 1000);

  // archive old
  await ExamAccess.updateMany({ userEmail: email, examId, status: "active" }, { $set: { status: "archived" } });

  const access = await ExamAccess.create({
    userEmail: email, examId, planDays: Number(planDays), startAt: start, expiryAt: expiry, status: "active",
  });

  // reset progress
  await StudyProgress.findOneAndUpdate(
    { userEmail: email, examId },
    { userEmail: email, examId, completedDays: [] },
    { upsert: true, new: true }
  );

  res.json({ success: true, access });
});

router.post("/access/revoke", isOwner, express.json(), async (req, res) => {
  const { email, examId } = req.body || {};
  await ExamAccess.updateMany({ userEmail: email, examId, status: "active" }, { $set: { status: "archived" } });
  res.json({ success: true });
});

router.get("/access/my", async (req, res) => {
  const { email = "", examId = "" } = req.query;
  const access = await ExamAccess.findOne({ userEmail: email, examId, status: "active" }).lean();
  res.json({ success: true, access });
});

/* ---------- user: resolve today + mark complete ---------- */
function dayFromStart(todayUTC, startUTC) {
  const d = Math.floor((todayUTC - startUTC) / (86400 * 1000)) + 1;
  return d < 1 ? 1 : d;
}

router.get("/:examId/today", async (req, res) => {
  const { email = "" } = req.query;
  const examId = req.params.examId;
  const access = await ExamAccess.findOne({ userEmail: email, examId, status: "active" }).lean();
  if (!access) return res.json({ success: true, todayDay: null, modules: [] });

  const todayDay = dayFromStart(Date.now(), new Date(access.startAt).getTime());
  const withinPlan = todayDay >= 1 && todayDay <= Number(access.planDays || 0);

  const all = await ModuleTemplate.find({ examId, dayIndex: todayDay }).sort({ slotTime: 1 }).lean();
  // Only return if within plan window
  res.json({ success: true, todayDay: withinPlan ? todayDay : null, modules: withinPlan ? all : [] });
});

router.post("/:examId/complete", express.json(), async (req, res) => {
  const { email = "", dayIndex } = req.body || {};
  if (!email || !dayIndex) return res.status(400).json({ success: false, message: "email & dayIndex required" });
  const doc = await StudyProgress.findOneAndUpdate(
    { userEmail: email, examId: req.params.examId },
    { $addToSet: { completedDays: Number(dayIndex) } },
    { upsert: true, new: true }
  );
  res.json({ success: true, progress: doc });
});

/* ========================= NEW: Overlay + Status + Intent ========================= */

/**
 * A) Public overlay config (safe)
 *    GET /api/prep/overlay/:examId
 */
router.get("/overlay/:examId", async (req, res) => {
  const cfg = await PrepOverlay.findOne({ examId: req.params.examId }).lean();
  if (!cfg) return res.json({ success: true, config: null });

  const upi = buildUpiDeepLink({
    pa: cfg.upiId,
    pn: cfg.upiName || cfg.examId,
    am: cfg.priceINR || undefined,
    tn: `${cfg.examId} prep plan`,
  });

  const wa = buildWhatsappLink(cfg.whatsappId, `Prep Payment Proof\nExam: ${cfg.examId}`);

  res.json({
    success: true,
    config: {
      examId: cfg.examId,
      priceINR: cfg.priceINR,
      bannerUrl: cfg.bannerUrl,
      upiId: cfg.upiId,
      upiName: cfg.upiName,
      upiDeepLink: upi,
      whatsappLink: wa,
      // NOTE: not returning whatsappQR raw content for safety
    },
  });
});

/**
 * A) ADMIN: create/update overlay config and upload banner/whatsappQR
 *    POST /api/prep/overlay/:examId
 *    fields: banner (file), whatsappQR (file), body: upiId, upiName, priceINR, whatsappId
 */
router.post(
  "/overlay/:examId",
  isOwner,
  upload.fields([{ name: "banner", maxCount: 1 }, { name: "whatsappQR", maxCount: 1 }]),
  async (req, res) => {
    const examId = req.params.examId;
    const patch = {
      ...(req.body.upiId != null ? { upiId: req.body.upiId.trim() } : {}),
      ...(req.body.upiName != null ? { upiName: req.body.upiName.trim() } : {}),
      ...(req.body.priceINR != null ? { priceINR: Number(req.body.priceINR) } : {}),
      ...(req.body.whatsappId != null ? { whatsappId: req.body.whatsappId.trim() } : {}),
    };

    if (req.files?.banner?.[0]) {
      patch.bannerUrl = await putAny("prep/banner", req.files.banner[0]);
    }
    if (req.files?.whatsappQR?.[0]) {
      patch.whatsappQR = await putAny("prep/whatsapp", req.files.whatsappQR[0]);
    }

    const cfg = await PrepOverlay.findOneAndUpdate(
      { examId },
      { examId, ...patch },
      { upsert: true, new: true }
    );
    res.json({ success: true, config: cfg });
  }
);

/**
 * B) Quick status to decide overlay/cta visibility
 *    GET /api/prep/status/:examId?email=<userEmail>
 */
router.get("/status/:examId", async (req, res) => {
  const { email = "" } = req.query;
  const examId = req.params.examId;

  const access = await ExamAccess.findOne({ userEmail: email, examId, status: "active" }).lean();
  const progress = await StudyProgress.findOne({ userEmail: email, examId }).lean();
  const totalDays = await ModuleTemplate.countDocuments({ examId });

  const completedCount = (progress?.completedDays || []).length;
  const isCompleted = totalDays > 0 && completedCount >= totalDays;

  res.json({
    success: true,
    access: !!access,
    plan: access || null,
    totalDays,
    completedCount,
    isCompleted,
  });
});

/**
 * C) Capture Start/Restart intent
 *    POST /api/prep/intent
 *    body: { examId, name, phone, email, priceINR }
 */
router.post("/intent", express.json(), async (req, res) => {
  const { examId, name = "", phone = "", email = "", priceINR = 0 } = req.body || {};
  if (!examId || !email) return res.status(400).json({ success: false, message: "examId & email required" });
  const doc = await PrepIntent.create({ examId, name, phone, email, priceINR: Number(priceINR) || 0 });
  res.json({ success: true, intent: doc });
});

/* ---------- error ---------- */
router.use((err, _req, res, _next) => {
  console.error("prep route error:", err);
  res.status(err.status || 500).json({ success: false, message: err.message || "Server error" });
});

export default router;
