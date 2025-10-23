// server/routes/prep.js
// LawNetwork Prep Routes — Exams, Modules, Access, Progress (NO request/admin endpoints here)

import express from "express";
import multer from "multer";
import mongoose from "mongoose";
import { isAdmin } from "./utils.js";

import PrepExam from "../models/PrepExam.js";
import PrepModule from "../models/PrepModule.js";
import PrepAccess from "../models/PrepAccess.js";
import PrepProgress from "../models/PrepProgress.js";

const router = express.Router();

/* ------------------------------- Upload ---------------------------------- */

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 40 * 1024 * 1024 },
});

function safeName(filename = "file") {
  return String(filename).replace(/\s+/g, "_").replace(/[^\w.\-]/g, "");
}

// Optional Cloudflare R2 helper
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

/* ---------------------------- helpers ------------------------------------ */

function truthy(v) {
  return ["true", "1", "on", "yes"].includes(String(v).trim().toLowerCase());
}

/* --------------------------- Plan + overlay ------------------------------- */

async function planDaysForExam(examId) {
  const days = await PrepModule.find({ examId }).distinct("dayIndex");
  if (!days.length) return 1;
  return Math.max(...days.map(Number).filter(Number.isFinite));
}
function dayIndexFrom(startAt, now = new Date()) {
  return Math.max(1, Math.floor((now - new Date(startAt)) / 86400000) + 1);
}

function tzParts(date, timeZone) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: +parts.year,
    month: +parts.month,
    day: +parts.day,
    hour: +parts.hour,
    minute: +parts.minute,
  };
}
function tzYMD(date, timeZone) {
  const p = tzParts(date, timeZone);
  return { year: p.year, month: p.month, day: p.day };
}
function daysBetweenTZ(aDate, bDate, timeZone) {
  const a = tzYMD(aDate, timeZone),
    b = tzYMD(bDate, timeZone);
  return Math.round((Date.UTC(b.year, b.month - 1, b.day) - Date.UTC(a.year, a.month - 1, a.day)) / 86400000);
}
function isTimeReachedInTZ(now, hhmm, timeZone) {
  const p = tzParts(now, timeZone);
  const [hh, mm] = String(hhmm || "09:00")
    .split(":")
    .map((x) => parseInt(x, 10) || 0);
  if (p.hour > hh) return true;
  if (p.hour < hh) return false;
  return p.minute >= mm;
}
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
    const todayDay = Math.max(1, daysBetweenTZ(startAt, now, tz) + 1);
    return { openAt: null, planTimeShow: todayDay >= showOnDay && isTimeReachedInTZ(now, showAtLocal, tz) };
  }
  if (mode === "fixed-date") {
    const dt = exam.overlay.fixedAt ? new Date(exam.overlay.fixedAt) : null;
    return { openAt: dt && !isNaN(+dt) ? dt : null, planTimeShow: false };
  }
  const base = access?.startAt ? new Date(access.startAt) : new Date();
  const days = Number(exam.overlay.offsetDays ?? 3);
  return { openAt: new Date(+base + days * 86400000), planTimeShow: false };
}

async function buildAccessStatusPayload(examId, email) {
  const exam = await PrepExam.findOne({ examId }).lean();
  if (!exam) {
    return { success: true, exam: null, access: { status: "none" }, overlay: {}, serverNow: Date.now() };
  }

  const planDays = await planDaysForExam(examId);
  const access = email ? await PrepAccess.findOne({ examId, userEmail: email }).lean() : null;

  let status = access?.status || "none";
  let todayDay = 1;
  if (access?.startAt) todayDay = Math.min(planDays, dayIndexFrom(access.startAt));
  const trialDays = Number(exam?.trialDays ?? 0);
  const canRestart = status === "active" && todayDay >= planDays;

  const { openAt, planTimeShow } = computeOverlayAt(exam, access);
  const pay = exam?.overlay?.payment || {};
  const overlay = {
    show: false,
    mode: null,
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
    access: { status, planDays, todayDay, canRestart, startAt: access?.startAt || null, trialDays },
    overlay,
    serverNow: Date.now(),
  };
}

/* ----------------------------- No-store ---------------------------------- */
function noStore(res) {
  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
}

/* -------------------------------- Exams ---------------------------------- */

router.get("/exams", async (_req, res) => {
  const exams = await PrepExam.find({}, { examId: 1, name: 1 }).sort({ name: 1 }).lean();
  res.json({ success: true, exams });
});

router.post("/exams", isAdmin, async (req, res) => {
  const { examId, name, scheduleMode = "cohort" } = req.body || {};
  if (!examId || !name)
    return res.status(400).json({ success: false, error: "examId & name required" });
  const doc = await PrepExam.findOneAndUpdate(
    { examId },
    { $set: { name, scheduleMode } },
    { upsert: true, new: true }
  );
  res.json({ success: true, exam: doc });
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

/* ------------------------------- Status ---------------------------------- */

router.get("/access/status-raw", async (req, res) => {
  try {
    const { examId, email } = req.query || {};
    if (!examId)
      return res.status(400).json({ success: false, error: "examId required" });
    const payload = await buildAccessStatusPayload(examId, email);
    noStore(res);
    res.json(payload);
  } catch (e) {
    res.status(500).json({ success: false, error: e?.message || "server error" });
  }
});

router.get("/user/summary", async (req, res) => {
  try {
    const { examId, email } = req.query || {};
    if (!examId)
      return res.status(400).json({ success: false, error: "examId required" });
    const payload = await buildAccessStatusPayload(examId, email);
    noStore(res);
    res.json(payload);
  } catch (e) {
    res.status(500).json({ success: false, error: e?.message || "server error" });
  }
});

/* ✅ Enforce overlay/approval before sending modules */
router.get("/user/today", async (req, res) => {
  try {
    const { examId, email } = req.query || {};
    if (!examId)
      return res.status(400).json({ success: false, error: "examId required" });

    const status = await buildAccessStatusPayload(examId, email);
    const accessStatus = status?.access?.status || "none";

    // 🚫 Hard gate: Unauthorized → trigger overlay
    if (accessStatus !== "active" && accessStatus !== "trial") {
      noStore(res);
      return res.json({
        success: false,
        locked: true,
        overlay: { ...(status.overlay || {}), show: true },
        message: null, // 👈 hide text, trigger overlay only
      });
    }

    // ✅ Authorized → show today's content
    const day = status?.access?.todayDay || 1;
    const items = await PrepModule.find({ examId, dayIndex: day })
      .sort({ releaseAt: 1, slotMin: 1 })
      .lean();

    noStore(res);
    res.json({ success: true, items, todayDay: day, summary: status });
  } catch (e) {
    res.status(500).json({ success: false, error: e?.message || "server error" });
  }
});

/* ------------------------------ User flows ------------------------------- */

router.post("/access/start-trial", async (req, res) => {
  try {
    const { examId, email } = req.body || {};
    if (!examId || !email)
      return res.status(400).json({ success: false, error: "examId & email required" });

    const planDays = await planDaysForExam(examId);
    const now = new Date();

    const existing = await PrepAccess.findOne({ examId, userEmail: email }).lean();
    if (existing && existing.status === "active") {
      return res.json({ success: true, access: existing, message: "already active" });
    }

    const doc = await PrepAccess.findOneAndUpdate(
      { examId, userEmail: email },
      { $set: { status: "trial", planDays, startAt: now } },
      { upsert: true, new: true }
    );
    res.json({ success: true, access: doc });
  } catch (e) {
    res.status(500).json({ success: false, error: e?.message || "server error" });
  }
});

/* ------------------------------ Templates -------------------------------- */

router.get("/templates", async (req, res) => {
  const { examId } = req.query || {};
  if (!examId)
    return res.status(400).json({ success: false, error: "examId required" });
  const items = await PrepModule.find({ examId })
    .sort({ dayIndex: 1, slotMin: 1 })
    .lean();
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
        content,
      } = req.body || {};

      if (!examId || !dayIndex)
        return res
          .status(400)
          .json({ success: false, error: "examId & dayIndex required" });

      const files = [];
      const saveFile = async (f) =>
        storeBuffer({
          buffer: f.buffer,
          filename: f.originalname || f.fieldname,
          mime: f.mimetype || "application/octet-stream",
        });

      if (req.files?.images)
        for (const f of req.files.images) {
          const s = await saveFile(f);
          files.push({ kind: "image", url: s.url, mime: f.mimetype });
        }
      if (req.files?.pdf?.[0]) {
        const f = req.files.pdf[0];
        const s = await saveFile(f);
        files.push({ kind: "pdf", url: s.url, mime: f.mimetype });
      }
      if (req.files?.audio?.[0]) {
        const f = req.files.audio[0];
        const s = await saveFile(f);
        files.push({ kind: "audio", url: s.url, mime: f.mimetype });
      }
      if (req.files?.video?.[0]) {
        const f = req.files.video[0];
        const s = await saveFile(f);
        files.push({ kind: "video", url: s.url, mime: f.mimetype });
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
        message: `Uploaded ${files.length} file(s)`,
      });
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

export default router;
