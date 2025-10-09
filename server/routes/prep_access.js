import express from "express";
import multer from "multer";
import mongoose from "mongoose";
import PrepExam from "../models/PrepExam.js";
import PrepModule from "../models/PrepModule.js";
import PrepAccess from "../models/PrepAccess.js";
import PrepAccessRequest from "../models/PrepAccessRequest.js";
import { isAdmin } from "./utils.js";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024 },
});

function truthy(v) {
  return ["true", "1", "on", "yes"].includes(String(v).trim().toLowerCase());
}
function safeName(filename = "file") {
  return String(filename).replace(/\s+/g, "_").replace(/[^\w.\-]/g, "");
}
function sanitizeUpiId(v) {
  if (!v) return "";
  return String(v).trim(); // you can tighten later if you want
}
function sanitizePhone(v) {
  if (!v) return "";
  // keep digits and leading +
  return String(v).trim().replace(/[^\d+]/g, "");
}
function sanitizeText(v) {
  if (!v) return "";
  return String(v).trim();
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

async function storeBuffer({ buffer, filename, mime, bucket = "prep" }) {
  const name = safeName(filename || "file");
  const contentType = mime || "application/octet-stream";
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
      console.warn("[access] R2 upload failed, fallback GridFS:", e.message);
    }
  }
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

/* ------------------------------------------------------------------
 * Helpers
 * ------------------------------------------------------------------ */
async function planDaysForExam(examId) {
  const days = await PrepModule.find({ examId }).distinct("dayIndex");
  if (!days.length) return 1;
  return Math.max(...days.map(Number).filter(Number.isFinite));
}
function dayIndexFrom(startAt, now = new Date()) {
  return Math.max(1, Math.floor((now - new Date(startAt)) / 86400000) + 1);
}
async function grantActiveAccess({ examId, email }) {
  const planDays = await planDaysForExam(examId);
  const now = new Date();
  const doc = await PrepAccess.findOneAndUpdate(
    { examId, userEmail: email },
    { $set: { status: "active", planDays, startAt: now }, $inc: { cycle: 1 } },
    { upsert: true, new: true }
  );
  return doc;
}

/** -----------------------------------------------------------------
 * Timezone helpers (no extra deps)
 * We compare server "now" and "startAt" *in a given IANA TZ*.
 * ------------------------------------------------------------------ */
// Get Y/M/D/H/M parts for a Date *as seen in a timezone*
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
  const parts = Object.fromEntries(fmt.formatToParts(date).map(p => [p.type, p.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
  };
}

// Strip time to local midnight in TZ (returns {year,month,day})
function tzYMD(date, timeZone) {
  const p = tzParts(date, timeZone);
  return { year: p.year, month: p.month, day: p.day };
}

// Days diff between two dates at local midnight in TZ
function daysBetweenTZ(aDate, bDate, timeZone) {
  const a = tzYMD(aDate, timeZone);
  const b = tzYMD(bDate, timeZone);
  const utcA = Date.UTC(a.year, a.month - 1, a.day);
  const utcB = Date.UTC(b.year, b.month - 1, b.day);
  return Math.round((utcB - utcA) / 86400000);
}

// Compare HH:mm (string) against current time in TZ
function isTimeReachedInTZ(now, hhmm, timeZone) {
  const p = tzParts(now, timeZone);
  const [hh, mm] = String(hhmm || "09:00").split(":").map(x => parseInt(x, 10) || 0);
  if (p.hour > hh) return true;
  if (p.hour < hh) return false;
  return p.minute >= mm;
}

/** -----------------------------------------------------------------
 * Compute overlay trigger time per user
 * - For planDayTime: server *decides show flag* using admin TZ,
 *   ignoring device clocks/timezones completely.
 * ------------------------------------------------------------------ */
function computeOverlayAt(exam, access) {
  if (!exam?.overlay || exam.overlay.mode === "never") return { openAt: null, planTimeShow: false };

  const mode = exam.overlay.mode;

  if (mode === "planDayTime") {
    const tz = exam.overlay.tz || "Asia/Kolkata";
    const showOnDay = Number(exam.overlay.showOnDay ?? 1);
    const showAtLocal = String(exam.overlay.showAtLocal || "09:00");
    const startAt = access?.startAt ? new Date(access.startAt) : null;

    if (!startAt) return { openAt: null, planTimeShow: false };

    const now = new Date();

    // Day index in TZ (start day = 1)
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

  // offset-days (default/legacy)
  const base = access?.startAt ? new Date(access.startAt) : new Date();
  const days = Number(exam.overlay.offsetDays ?? 3);
  const openAt = new Date(+base + days * 86400000);
  return { openAt, planTimeShow: false };
}

const router = express.Router();

/* ------------------------------------------------------------------
 * NEW ADMIN ENDPOINTS
 * ------------------------------------------------------------------ */

// Get exam meta (price/trialDays/overlay) for admin UI
router.get("/exams/:examId/meta", isAdmin, async (req, res) => {
  const exam = await PrepExam.findOne({ examId: req.params.examId }).lean();
  if (!exam)
    return res.status(404).json({ success: false, message: "Exam not found" });
  const { price = 0, trialDays = 3, overlay = {}, payment = {} } = exam;
  res.json({
    success: true,
    price,
    trialDays,
    overlay,
    payment,  // <-- expose for admin UI
    name: exam.name,
    examId: exam.examId,
  });
});

// Update overlay config (and price/trialDays)
// Also persist showOnDay, showAtLocal, optional tz, and payment config
router.patch("/exams/:examId/overlay-config", isAdmin, async (req, res) => {
  const {
    price,
    trialDays,
    mode,
    offsetDays,
    fixedAt,
    showOnDay,
    showAtLocal,
    tz, // optional IANA tz, e.g. "Asia/Kolkata"
    payment, // { upiId, waPhone, waText } optional
  } = req.body || {};

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
    },
    ...(payment
      ? {
          payment: {
            ...(payment.upiId ? { upiId: sanitizeUpiId(payment.upiId) } : {}),
            ...(payment.waPhone ? { waPhone: sanitizePhone(payment.waPhone) } : {}),
            ...(payment.waText ? { waText: sanitizeText(payment.waText) } : {}),
          },
        }
      : {}),
  };

  // Ensure default tz if planDayTime chosen and tz not provided
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

/* ------------------------------------------------------------------
 * GET /api/prep/access/status
 * ------------------------------------------------------------------ */
router.get("/access/status", async (req, res) => {
  try {
    const { examId, email } = req.query || {};
    if (!examId)
      return res.status(400).json({ success: false, error: "examId required" });

    const exam = await PrepExam.findOne({ examId }).lean();
    if (!exam)
      return res.json({ exam: null, access: { status: "none" }, overlay: {}, serverNow: Date.now() });

    const planDays = await planDaysForExam(examId);
    const access = email
      ? await PrepAccess.findOne({ examId, userEmail: email }).lean()
      : null;

    let status = access?.status || "none";
    let todayDay = 1;
    if (access?.startAt)
      todayDay = Math.min(planDays, dayIndexFrom(access.startAt));
    const canRestart = status === "active" && todayDay >= planDays;

    // Include overlay plan (client can read for display, but server owns timing)
    const ov = exam?.overlay || null;
    if (ov && access) {
      access.overlayPlan = {
        mode: ov.mode || "planDayTime",
        showOnDay: Number(ov.showOnDay || 1),
        showAtLocal: String(ov.showAtLocal || "09:00"),
        tz: ov.tz || "Asia/Kolkata",
      };
    }

    // derive overlay timing
    const { openAt, planTimeShow } = computeOverlayAt(exam, access);
    const now = Date.now();
    let overlay = {
      show: false,
      mode: null,
      openAt: openAt ? openAt.toISOString() : null,
      tz: exam?.overlay?.tz || "Asia/Kolkata",
    };

    if (exam?.overlay?.mode === "planDayTime") {
      if (planTimeShow) {
        const forceRestart = canRestart;
        overlay.mode = (status === "active" && forceRestart) ? "restart" : "purchase";
        overlay.show = true;
      }
    } else {
      if (openAt && +openAt <= now) {
        const forceRestart = canRestart;
        overlay.mode = (status === "active" && forceRestart) ? "restart" : "purchase";
        overlay.show = true;
      }
    }

    // --- legacy overlay schedule safeguards (kept) ---
    const ovLegacy = exam?.overlay || {};
    let forceOverlay = false;

    if (ovLegacy.overlayMode === "afterN") {
      const startMs = Date.parse(
        access?.startedAt ||
        access?.createdAt ||
        access?.trialStartedAt ||
        0
      );
      if (startMs && ovLegacy.daysAfterStart > 0) {
        forceOverlay = now >= startMs + ovLegacy.daysAfterStart * 86400000;
      }
    }

    if (ovLegacy.overlayMode === "fixed") {
      const fixedMs = Date.parse(ovLegacy.fixedAt || 0);
      if (fixedMs) forceOverlay = now >= fixedMs;
    }

    if (forceOverlay) {
      if (access) {
        access.overlayForce = true;
        access.forceMode = "purchase";
      }
      overlay.show = true;
      overlay.mode = "purchase";
    }
    // --- end legacy block ---

    const trialDays = Number(exam?.trialDays || 3);
    const trialEnded = status === "trial" && todayDay > trialDays;

    res.json({
      success: true,
      exam, // includes exam.payment if configured
      access: {
        status,
        planDays,
        todayDay,
        canRestart,
        trialEnded,
        startAt: access?.startAt,
        overlayForce: access?.overlayForce || false,
        forceMode: access?.forceMode || null,
        overlayPlan: access?.overlayPlan || null,
      },
      overlay,
      serverNow: Date.now(),
    });
  } catch (e) {
    res
      .status(500)
      .json({ success: false, error: e?.message || "server error" });
  }
});

/* ------------------------------------------------------------------
 * Other existing routes (unchanged)
 * ------------------------------------------------------------------ */

// Start trial
router.post("/access/start-trial", async (req, res) => {
  try {
    const { examId, email } = req.body || {};
    if (!examId || !email)
      return res
        .status(400)
        .json({ success: false, error: "examId & email required" });

    const planDays = await planDaysForExam(examId);
    const now = new Date();

    const existing = await PrepAccess.findOne({ examId, userEmail: email }).lean();
    if (existing && existing.status === "active") {
      return res.json({
        success: true,
        access: existing,
        message: "already active",
      });
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

// Access request
router.post("/access/request", upload.single("screenshot"), async (req, res) => {
  try {
    const { examId, email, intent, note } = req.body || {};
    if (!examId || !email || !intent)
      return res
        .status(400)
        .json({ success: false, error: "examId, email, intent required" });

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
      await grantActiveAccess({ examId, email });
      await PrepAccessRequest.updateOne(
        { _id: reqDoc._id },
        {
          $set: {
            status: "approved",
            approvedAt: new Date(),
            approvedBy: "auto",
          },
        }
      );
      return res.json({ success: true, approved: true, request: reqDoc });
    }

    res.json({ success: true, approved: false, request: reqDoc });
  } catch (e) {
    res.status(500).json({ success: false, error: e?.message || "server error" });
  }
});

// Admin list requests
router.get("/access/requests", isAdmin, async (req, res) => {
  try {
    const { examId, status = "pending" } = req.query || {};
    const q = {};
    if (examId) q.examId = examId;
    if (status) q.status = status;
    const items = await PrepAccessRequest.find(q)
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();
    res.json({ success: true, items });
  } catch (e) {
    res.status(500).json({ success: false, error: e?.message || "server error" });
  }
});

// Admin approve/revoke
router.post("/access/admin/approve", isAdmin, async (req, res) => {
  try {
    const { requestId, approve = true } = req.body || {};
    const ar = await PrepAccessRequest.findById(requestId);
    if (!ar)
      return res.status(404).json({ success: false, error: "request not found" });

    if (!approve) {
      ar.status = "rejected";
      await ar.save();
      return res.json({ success: true, request: ar });
    }

    await grantActiveAccess({ examId: ar.examId, email: ar.userEmail });
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
      return res
        .status(400)
        .json({ success: false, error: "examId & email required" });
    const r = await PrepAccess.updateOne(
      { examId, userEmail: email },
      { $set: { status: "revoked" } }
    );
    res.json({ success: true, updated: r.modifiedCount });
  } catch (e) {
    res.status(500).json({ success: false, error: e?.message || "server error" });
  }
});

export default router;
