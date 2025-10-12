// server/routes/prep.js
// LawNetwork Prep Routes — Exams, Modules, Access, Progress + Overlay/Payment

import express from "express";
import multer from "multer";
import mongoose from "mongoose";
import { isAdmin } from "./utils.js";

import PrepExam from "../models/PrepExam.js";
import PrepModule from "../models/PrepModule.js";
import PrepAccess from "../models/PrepAccess.js";
import PrepAccessRequest from "../models/PrepAccessRequest.js";
import PrepProgress from "../models/PrepProgress.js";

const router = express.Router();

/* -------------------------------------------------------------------------- */
/*                               Upload helpers                               */
/* -------------------------------------------------------------------------- */

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 40 * 1024 * 1024 }, // 40 MB per file
});

function safeName(filename = "file") {
  return String(filename).replace(/\s+/g, "_").replace(/[^\w.\-]/g, "");
}

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

/** Store buffer to R2 (if enabled) else GridFS. Returns { url, via } */
async function storeBuffer({ buffer, filename, mime, bucket = "prep" }) {
  const name = safeName(filename || "file");
  const contentType = mime || "application/octet-stream";

  // Try R2 first
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

/* -------------------------------------------------------------------------- */
/*                            Small sanitizers/util                            */
/* -------------------------------------------------------------------------- */

function sanitizeUpiId(v) { return v ? String(v).trim() : ""; }
function sanitizePhone(v) { return v ? String(v).trim().replace(/[^\d+]/g, "") : ""; }
function sanitizeText(v) { return v ? String(v).trim() : ""; }
function truthy(v) { return ["true","1","on","yes"].includes(String(v).trim().toLowerCase()); }

/* -------------------------------------------------------------------------- */
/*                            Plan/overlay computations                        */
/* -------------------------------------------------------------------------- */

async function planDaysForExam(examId) {
  const days = await PrepModule.find({ examId }).distinct("dayIndex");
  if (!days.length) return 1;
  return Math.max(...days.map(Number).filter(Number.isFinite));
}
function dayIndexFrom(startAt, now = new Date()) {
  return Math.max(1, Math.floor((now - new Date(startAt)) / 86400000) + 1);
}

/** TZ helpers to compute planDayTime visibility strictly server-side */
function tzParts(date, timeZone) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hour12: false,
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map(p => [p.type, p.value]));
  return {
    year: +parts.year, month: +parts.month, day: +parts.day,
    hour: +parts.hour, minute: +parts.minute,
  };
}
function tzYMD(date, timeZone) { const p = tzParts(date, timeZone); return { year: p.year, month: p.month, day: p.day }; }
function daysBetweenTZ(aDate, bDate, timeZone) {
  const a = tzYMD(aDate, timeZone), b = tzYMD(bDate, timeZone);
  const utcA = Date.UTC(a.year, a.month - 1, a.day);
  const utcB = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((utcB - utcA) / 86400000);
}
function isTimeReachedInTZ(now, hhmm, timeZone) {
  const p = tzParts(now, timeZone);
  const [hh, mm] = String(hhmm || "09:00").split(":").map(x => parseInt(x, 10) || 0);
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
    const daysDone = daysBetweenTZ(startAt, now, tz);
    const todayDay = Math.max(1, daysDone + 1);

    const dayOk = todayDay >= showOnDay;
    const timeOk = isTimeReachedInTZ(now, showAtLocal, tz);

    return { openAt: null, planTimeShow: dayOk && timeOk };
  }

  if (mode === "fixed-date") {
    const dt = exam.overlay.fixedAt ? new Date(exam.overlay.fixedAt) : null;
    return { openAt: dt && !isNaN(+dt) ? dt : null, planTimeShow: false };
  }

  // offset-days (default)
  const base = access?.startAt ? new Date(access.startAt) : new Date();
  const days = Number(exam.overlay.offsetDays ?? 3);
  const openAt = new Date(+base + days * 86400000);
  return { openAt, planTimeShow: false };
}

/* -------------------------------------------------------------------------- */
/*                              Shared status payload                          */
/* -------------------------------------------------------------------------- */

async function buildAccessStatusPayload(examId, email) {
  const exam = await PrepExam.findOne({ examId }).lean();
  if (!exam) {
    return {
      success: true,
      exam: null,
      access: { status: "none" },
      overlay: {},
      serverNow: Date.now(),
    };
  }

  const planDays = await planDaysForExam(examId);
  const access = email
    ? await PrepAccess.findOne({ examId, userEmail: email }).lean()
    : null;

  let status = access?.status || "none";
  let todayDay = 1;
  if (access?.startAt) todayDay = Math.min(planDays, dayIndexFrom(access.startAt));
  const canRestart = status === "active" && todayDay >= planDays;

  // compute overlay timing
  const { openAt, planTimeShow } = computeOverlayAt(exam, access);
  const now = Date.now();

  // pack payment info for client
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
  };

  if (exam?.overlay?.mode === "planDayTime") {
    if (planTimeShow) {
      overlay.mode = status === "active" && canRestart ? "restart" : "purchase";
      overlay.show = true;
    }
  } else {
    if (openAt && +new Date(openAt) <= now) {
      overlay.mode = status === "active" && canRestart ? "restart" : "purchase";
      overlay.show = true;
    }
  }

  return {
    success: true,
    exam: { examId: exam.examId, name: exam.name, price: exam.price },
    access: {
      status,
      planDays,
      todayDay,
      canRestart,
      startAt: access?.startAt || null,
    },
    overlay,
    serverNow: Date.now(),
  };
}

/* -------------------------------------------------------------------------- */
/*                                   Exams                                    */
/* -------------------------------------------------------------------------- */

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
    if (!examId) return res.status(400).json({ success: false, error: "examId required" });

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

/* -------------------- Admin Overlay Meta (for the editor) ------------------ */

router.get("/exams/:examId/meta", isAdmin, async (req, res) => {
  const exam = await PrepExam.findOne({ examId: req.params.examId }).lean();
  if (!exam) return res.status(404).json({ success: false, message: "Exam not found" });
  const { price = 0, trialDays = 3, overlay = {}, payment = {} } = exam;
  res.json({
    success: true,
    price,
    trialDays,
    overlay,
    payment, // legacy root
    name: exam.name,
    examId: exam.examId,
  });
});

/* ------------- PATCH overlay config + payment (flat or nested {payment}) --- */

router.patch("/exams/:examId/overlay-config", isAdmin, async (req, res) => {
  const {
    price, trialDays, mode, offsetDays, fixedAt, showOnDay, showAtLocal, tz,
    upiId, upiName, whatsappNumber, whatsappText,
    payment: p = {},
  } = req.body || {};

  const eff = {
    upiId:          sanitizeUpiId((upiId ?? p.upiId) || ""),
    upiName:        sanitizeText((upiName ?? p.upiName) || ""),
    whatsappNumber: sanitizePhone((whatsappNumber ?? p.whatsappNumber ?? p.waPhone) || ""),
    whatsappText:   sanitizeText((whatsappText ?? p.whatsappText  ?? p.waText)   || ""),
  };

  const update = {
    ...(price != null ? { price: Number(price) } : {}),
    ...(trialDays != null ? { trialDays: Number(trialDays) } : {}),
    overlay: {
      ...(mode ? { mode } : {}),
      ...(offsetDays != null ? { offsetDays: Number(offsetDays) } : {}),
      ...(fixedAt ? { fixedAt: new Date(fixedAt) } : { fixedAt: null }),
      ...(showOnDay != null ? { showOnDay: Number(showOnDay) } : {}),
      ...(showAtLocal ? { showAtLocal: String(showAtLocal) } : {}),
      ...(tz ? { tz: String(tz) } : {}),
      ...(Object.values(eff).some(Boolean) ? { payment: eff } : {}),
    },

    // ✅ mirror at root for legacy readers
    ...(Object.values(eff).some(Boolean) ? { payment: eff } : {}),
  };
  if (update.overlay?.mode === "planDayTime" && !("tz" in update.overlay)) {
    update.overlay.tz = "Asia/Kolkata";
  }

  const doc = await PrepExam.findOneAndUpdate(
    { examId: req.params.examId },
    { $set: update },
    { new: true }
  ).lean();

  res.json({ success: true, exam: doc });
});

/* -------------------------------------------------------------------------- */
/*                                   Status                                   */
/* -------------------------------------------------------------------------- */

// Canonical status endpoint (client may use this directly)
router.get("/access/status", async (req, res) => {
  try {
    const { examId, email } = req.query || {};
    if (!examId)
      return res.status(400).json({ success: false, error: "examId required" });

    const payload = await buildAccessStatusPayload(examId, email);
    res.json(payload);
  } catch (e) {
    res.status(500).json({ success: false, error: e?.message || "server error" });
  }
});

/* ---------- Legacy aliases expected by your popup (return SAME payload) ---- */

// GET /api/prep/user/summary?examId=...&email=...
router.get("/user/summary", async (req, res) => {
  try {
    const { examId, email } = req.query || {};
    if (!examId)
      return res.status(400).json({ success: false, error: "examId required" });

    const payload = await buildAccessStatusPayload(examId, email);
    res.json(payload); // includes overlay.payment (upiId, upiName, whatsappNumber, whatsappText)
  } catch (e) {
    res.status(500).json({ success: false, error: e?.message || "server error" });
  }
});

// GET /api/prep/user/today?examId=...&email=...
router.get("/user/today", async (req, res) => {
  try {
    const { examId, email } = req.query || {};
    if (!examId)
      return res.status(400).json({ success: false, error: "examId required" });

    // modules for today's computed day
    const status = await buildAccessStatusPayload(examId, email);
    const day = status?.access?.todayDay || 1;

    const items = await PrepModule.find({ examId, dayIndex: day })
      .sort({ releaseAt: 1, slotMin: 1 })
      .lean();

    res.json({ success: true, items, todayDay: day, summary: status });
  } catch (e) {
    res.status(500).json({ success: false, error: e?.message || "server error" });
  }
});

/* -------------------------------------------------------------------------- */
/*                                 User flows                                 */
/* -------------------------------------------------------------------------- */

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

// user submits payment proof (screenshot optional)
router.post("/access/request", upload.single("screenshot"), async (req, res) => {
  try {
    const { examId, email, intent, note } = req.body || {};
    if (!examId || !email || !intent)
      return res.status(400).json({ success: false, error: "examId, email, intent required" });

    let screenshotUrl = "";
    if (req.file?.buffer?.length) {
      const saved = await storeBuffer({
        buffer: req.file.buffer,
        filename: req.file.originalname || "payment.jpg",
        mime: req.file.mimetype || "application/octet-stream",
        bucket: "prep-proof",
      });
      screenshotUrl = saved.url;
    }

    const exam = await PrepExam.findOne({ examId }).lean();
    const price = Number(exam?.price || 0);
    const autoGrant = !!exam?.autoGrantRestart;

    const reqDoc = await PrepAccessRequest.create({
      examId,
      userEmail: email,
      intent,
      screenshotUrl,
      note,
      status: "pending",
      priceAt: price,
    });

    if (autoGrant) {
      const pd = await planDaysForExam(examId);
      const now = new Date();
      await PrepAccess.findOneAndUpdate(
        { examId, userEmail: email },
        { $set: { status: "active", planDays: pd, startAt: now }, $inc: { cycle: 1 } },
        { upsert: true, new: true }
      );
      await PrepAccessRequest.updateOne(
        { _id: reqDoc._id },
        { $set: { status: "approved", approvedAt: new Date(), approvedBy: "auto" } }
      );
      return res.json({ success: true, approved: true, request: reqDoc });
    }

    res.json({ success: true, approved: false, request: reqDoc });
  } catch (e) {
    res.status(500).json({ success: false, error: e?.message || "server error" });
  }
});

/* ----------------------------- Admin: requests ----------------------------- */

router.get("/access/requests", isAdmin, async (req, res) => {
  try {
    const { examId, status = "pending" } = req.query || {};
    const q = {};
    if (examId) q.examId = examId;
    if (status) q.status = status;
    const items = await PrepAccessRequest.find(q).sort({ createdAt: -1 }).limit(100).lean();
    res.json({ success: true, items });
  } catch (e) {
    res.status(500).json({ success: false, error: e?.message || "server error" });
  }
});

router.post("/access/admin/approve", isAdmin, async (req, res) => {
  try {
    const { requestId, approve = true } = req.body || {};
    const ar = await PrepAccessRequest.findById(requestId);
    if (!ar) return res.status(404).json({ success: false, error: "request not found" });

    if (!approve) {
      ar.status = "rejected";
      await ar.save();
      return res.json({ success: true, request: ar });
    }

    const pd = await planDaysForExam(ar.examId);
    const now = new Date();
    await PrepAccess.findOneAndUpdate(
      { examId: ar.examId, userEmail: ar.userEmail },
      { $set: { status: "active", planDays: pd, startAt: now }, $inc: { cycle: 1 } },
      { upsert: true, new: true }
    );

    ar.status = "approved";
    ar.approvedAt = new Date();
    ar.approvedBy = "admin";
    await ar.save();

    res.json({ success: true, request: ar });
  } catch (e) {
    res.status(500).json({ success: false, error: e?.message || "server error" });
  }
});

router.post("/access/admin/revoke", isAdmin, async (req, res) => {
  try {
    const { examId, email } = req.body || {};
    if (!examId || !email)
      return res.status(400).json({ success: false, error: "examId & email required" });

    const r = await PrepAccess.updateOne(
      { examId, userEmail: email },
      { $set: { status: "revoked" } }
    );
    res.json({ success: true, updated: r.modifiedCount });
  } catch (e) {
    res.status(500).json({ success: false, error: e?.message || "server error" });
  }
});

/* -------------------------------------------------------------------------- */
/*                                Templates CRUD                              */
/* -------------------------------------------------------------------------- */

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
        content, // pasted text (alt to manualText)
      } = req.body || {};

      if (!examId || !dayIndex) {
        return res
          .status(400)
          .json({ success: false, error: "examId & dayIndex required" });
      }

      const files = [];
      const saveFile = async (f) =>
        storeBuffer({
          buffer: f.buffer,
          filename: f.originalname || f.fieldname,
          mime: f.mimetype || "application/octet-stream",
        });

      if (req.files?.images) {
        for (const f of req.files.images) {
          const s = await saveFile(f);
          files.push({ kind: "image", url: s.url, mime: f.mimetype });
        }
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
      const status =
        relAt && relAt > new Date() ? "scheduled" : "released";

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

/* -------------------------------------------------------------------------- */

export default router;
