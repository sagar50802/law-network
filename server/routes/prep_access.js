// server/routes/prep_access.js
import express from "express";
import multer from "multer";
import mongoose from "mongoose";
import PrepExam from "../models/PrepExam.js";
import PrepModule from "../models/PrepModule.js";
import PrepAccess from "../models/PrepAccess.js";
import PrepAccessRequest from "../models/PrepAccessRequest.js";
import { isAdmin } from "./utils.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 12 * 1024 * 1024 } });

function truthy(v) {
  return ["true", "1", "on", "yes"].includes(String(v).trim().toLowerCase());
}
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

// --- helpers ---
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

const router = express.Router();

/* -----------------------------------------------------------
 * GET /api/prep/access/status?examId&email
 * Adds schedule-based overlay logic
 * ----------------------------------------------------------- */
router.get("/access/status", async (req, res) => {
  try {
    const { examId, email } = req.query || {};
    if (!examId) return res.status(400).json({ success: false, error: "examId required" });

    const exam = await PrepExam.findOne({ examId }).lean();
    const price = Number(exam?.price || 0);
    const trialDays = Number(exam?.trialDays || 3);

    const planDays = await planDaysForExam(examId);
    const access = email ? await PrepAccess.findOne({ examId, userEmail: email }).lean() : null;

    let status = access?.status || "none";
    let todayDay = 1;
    if (access?.startAt) todayDay = Math.min(planDays, dayIndexFrom(access.startAt));
    const canRestart = status === "active" && todayDay >= planDays;

    const pending = email
      ? await PrepAccessRequest.findOne({ examId, userEmail: email, status: "pending" })
          .sort({ createdAt: -1 })
          .lean()
      : null;

    const trialEnded = status === "trial" && todayDay > trialDays;

    // --- NEW overlay scheduling decision ---
    const overlay = exam; // same model holds overlay fields
    let forceOverlay = false;
    const now = Date.now();

    if (overlay?.forceOverlayAt && now >= new Date(overlay.forceOverlayAt).getTime()) {
      forceOverlay = true;
    }
    if (!forceOverlay && Number.isFinite(overlay?.forceOverlayAfterDays)) {
      const started = access?.startAt ? new Date(access.startAt).getTime() : null;
      if (started != null) {
        const ms = overlay.forceOverlayAfterDays * 86400000;
        if (now >= started + ms) forceOverlay = true;
      }
    }

    let mode = "";
    let show = false;
    if (access?.pending) {
      mode = "waiting";
      show = true;
    } else if (access?.status === "active" && access?.canRestart) {
      mode = "restart";
      show = true;
    } else if (forceOverlay) {
      mode = "purchase";
      show = true;
    } else if (access?.status === "trial" && access?.trialEnded) {
      mode = "purchase";
      show = true;
    }

    return res.json({
      success: true,
      exam: {
        id: examId,
        name: exam?.name || examId,
        price,
        trialDays,
        autoGrantRestart: !!exam?.autoGrantRestart,
        forceOverlayAt: exam?.forceOverlayAt || null,
        forceOverlayAfterDays: exam?.forceOverlayAfterDays ?? null,
        tz: exam?.tz || null,
      },
      access: { status, planDays, todayDay, canRestart, trialEnded, pending: !!pending, startAt: access?.startAt },
      show,
      mode,
      forceOverlay,
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e?.message || "server error" });
  }
});

/* -----------------------------------------------------------
 * POST /api/prep/overlay (admin — save overlay settings)
 * ----------------------------------------------------------- */
router.post("/overlay", isAdmin, async (req, res) => {
  try {
    const { examId } = req.body || {};
    if (!examId) return res.status(400).json({ success: false, error: "examId required" });

    const update = {
      price: Number(req.body.price || 0),
      trialDays: Math.max(0, Number(req.body.trialDays || 0)),
    };

    // NEW optional scheduling fields
    if (req.body.forceOverlayAfterDays === "" || req.body.forceOverlayAfterDays == null) {
      update.forceOverlayAfterDays = null;
    } else {
      const n = Number(req.body.forceOverlayAfterDays);
      update.forceOverlayAfterDays = Number.isFinite(n) ? Math.max(0, n) : null;
    }

    const atRaw = (req.body.forceOverlayAt || "").trim();
    update.forceOverlayAt = atRaw ? new Date(atRaw) : null;
    update.tz = (req.body.tz || "").trim() || null;

    await PrepExam.updateOne({ examId }, { $set: update }, { upsert: true });
    return res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, error: e?.message || "server error" });
  }
});

/* -----------------------------------------------------------
 * POST /api/prep/access/start-trial
 * ----------------------------------------------------------- */
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

/* -----------------------------------------------------------
 * POST /api/prep/access/request  (multipart)
 * ----------------------------------------------------------- */
router.post("/access/request", upload.single("screenshot"), async (req, res) => {
  try {
    const { examId, email, intent, note } = req.body || {};
    if (!examId || !email || !intent) {
      return res.status(400).json({ success: false, error: "examId, email, intent required" });
    }

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
        { $set: { status: "approved", approvedAt: new Date(), approvedBy: "auto" } }
      );
      return res.json({ success: true, approved: true, request: reqDoc });
    }

    res.json({ success: true, approved: false, request: reqDoc });
  } catch (e) {
    res.status(500).json({ success: false, error: e?.message || "server error" });
  }
});

/* -----------------------------------------------------------
 * GET /api/prep/access/requests  (admin)
 * ----------------------------------------------------------- */
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

/* -----------------------------------------------------------
 * POST /api/prep/access/admin/approve  (admin)
 * ----------------------------------------------------------- */
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

/* -----------------------------------------------------------
 * POST /api/prep/access/admin/revoke  (admin)
 * ----------------------------------------------------------- */
router.post("/access/admin/revoke", isAdmin, async (req, res) => {
  try {
    const { examId, email } = req.body || {};
    if (!examId || !email)
      return res.status(400).json({ success: false, error: "examId & email required" });
    const r = await PrepAccess.updateOne({ examId, userEmail: email }, { $set: { status: "revoked" } });
    res.json({ success: true, updated: r.modifiedCount });
  } catch (e) {
    res.status(500).json({ success: false, error: e?.message || "server error" });
  }
});

export default router;
