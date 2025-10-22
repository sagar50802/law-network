// LawNetwork Prep — Access Requests + Overlay/Payment Admin (separate from prep.js)

import express from "express";
import multer from "multer";
import mongoose from "mongoose";
import { isAdmin } from "./utils.js";

import PrepExam from "../models/PrepExam.js";
import PrepModule from "../models/PrepModule.js";
import PrepAccess from "../models/PrepAccess.js";
import PrepAccessRequest from "../models/PrepAccessRequest.js";

/* ------------------------------------------------------------------ */
/* Uploads                                                            */
/* ------------------------------------------------------------------ */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 40 * 1024 * 1024 }, // 40 MB
});

const jsonBody = express.json();

/* ------------------------------------------------------------------ */
/* Helpers                                                            */
/* ------------------------------------------------------------------ */
function truthy(v) {
  return ["true", "1", "on", "yes"].includes(String(v).trim().toLowerCase());
}
function safeName(filename = "file") {
  return String(filename).replace(/\s+/g, "_").replace(/[^\w.\-]/g, "");
}
function sanitizeText(v) {
  return v ? String(v).trim() : "";
}
function sanitizePhone(v) {
  return v ? String(v).trim().replace(/[^\d+]/g, "") : "";
}
function sanitizeUpiId(v) {
  return v ? String(v).trim() : "";
}

/* ------------------------------------------------------------------ */
/* Optional R2 / GridFS                                               */
/* ------------------------------------------------------------------ */
let R2 = null;
try { R2 = await import("../utils/r2.js"); } catch { R2 = null; }

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
      console.warn("[prep_access] R2 upload failed → GridFS fallback:", e.message);
    }
  }

  // Fallback GridFS
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

/* ------------------------------------------------------------------ */
/* Utility functions                                                  */
/* ------------------------------------------------------------------ */
async function planDaysForExam(examId) {
  const days = await PrepModule.find({ examId }).distinct("dayIndex");
  if (!days.length) return 1;
  return Math.max(...days.map(Number).filter(Number.isFinite));
}

async function grantActiveAccess({ examId, email }) {
  const planDays = await planDaysForExam(examId);
  const now = new Date();
  const doc = await PrepAccess.findOneAndUpdate(
    { examId, userEmail: email.toLowerCase() },
    { $set: { status: "active", planDays, startAt: now }, $inc: { cycle: 1 } },
    { upsert: true, new: true }
  );
  return doc;
}

/* ------------------------------------------------------------------ */
/* Router setup                                                      */
/* ------------------------------------------------------------------ */
const router = express.Router();

/* ================================================================== */
/* ADMIN: Overlay UI uploads                                          */
/* ================================================================== */
router.get("/overlay/:examId", isAdmin, async (req, res) => {
  const exam = await PrepExam.findOne(
    { examId: req.params.examId },
    { overlayUI: 1, price: 1, trialDays: 1, name: 1, examId: 1 }
  ).lean();
  if (!exam) return res.status(404).json({ success: false, message: "Exam not found" });
  res.json({ success: true, config: exam.overlayUI || {}, exam });
});

router.post(
  "/overlay/:examId",
  isAdmin,
  upload.fields([{ name: "banner" }, { name: "whatsappQR" }]),
  async (req, res) => {
    const examId = req.params.examId;
    const {
      upiId = "", upiName = "", priceINR = 0,
      whatsappId = "", forceOverlayAfterDays = "", forceOverlayAt = "", tz = ""
    } = req.body || {};

    let bannerUrl = "";
    let whatsappQRUrl = "";

    if (req.files?.banner?.[0]) {
      const f = req.files.banner[0];
      const s = await storeBuffer({
        buffer: f.buffer, filename: f.originalname, mime: f.mimetype, bucket: "prep-overlay"
      });
      bannerUrl = s.url;
    }
    if (req.files?.whatsappQR?.[0]) {
      const f = req.files.whatsappQR[0];
      const s = await storeBuffer({
        buffer: f.buffer, filename: f.originalname, mime: f.mimetype, bucket: "prep-overlay"
      });
      whatsappQRUrl = s.url;
    }

    const overlayUI = {
      upiId: String(upiId).trim(),
      upiName: String(upiName || "").trim(),
      priceINR: Number(priceINR || 0),
      whatsappLink: whatsappId ? `https://wa.me/${String(whatsappId).replace(/\D/g, "")}` : "",
      ...(bannerUrl ? { bannerUrl } : {}),
      ...(whatsappQRUrl ? { whatsappQRUrl } : {}),
      ...(forceOverlayAfterDays !== "" ? { forceOverlayAfterDays: Number(forceOverlayAfterDays) } : {}),
      ...(forceOverlayAt ? { forceOverlayAt: new Date(forceOverlayAt).toISOString() } : {}),
      ...(tz ? { tz: String(tz) } : {}),
    };

    const update = {
      overlayUI,
      ...(priceINR ? { price: Number(priceINR) } : {}),
    };

    const doc = await PrepExam.findOneAndUpdate({ examId }, { $set: update }, { new: true }).lean();
    res.json({ success: true, exam: doc });
  }
);

/* ================================================================== */
/* PUBLIC: ACCESS STATUS — FIXED VERSION                              */
/* ================================================================== */
// 🩵 Enforce overlay for all users who are not explicitly active
router.get("/access/status", async (req, res) => {
  try {
    const { examId, email } = req.query;
    if (!examId || !email) return res.json({ overlay: { show: true, mode: "purchase" } });

    const exam = await PrepExam.findOne({ examId });
    const access = await PrepAccess.findOne({ examId, userEmail: email });

    // 🧩 no access found OR expired OR revoked → overlay must show
    if (!access || access.status !== "active") {
      return res.json({
        exam,
        access: { status: "locked" },
        overlay: { show: true, mode: "purchase" },
      });
    }

    // 🧩 if still active (and not expired), allow
    const expired = access.expiresAt && new Date(access.expiresAt) < new Date();
    if (expired) {
      access.status = "expired";
      await access.save();
      return res.json({
        exam,
        access: { status: "locked" },
        overlay: { show: true, mode: "purchase" },
      });
    }

    // ✅ user is active → show content
    return res.json({ exam, access, overlay: { show: false } });
  } catch (e) {
    console.error("status error:", e);
    return res.json({ overlay: { show: true, mode: "purchase" } });
  }
});

/* ================================================================== */
/* PUBLIC: CREATE REQUEST — FIXED VERSION                             */
/* ================================================================== */
// 🧾 Viewer creates access request
router.post("/access/request", async (req, res) => {
  try {
    const { examId, email, userEmail, intent } = req.body || {};
    if (!examId || !email)
      return res.json({ success: false, message: "Missing examId/email" });

    // check if already active
    const existing = await PrepAccess.findOne({ examId, userEmail: email, status: "active" });
    if (existing)
      return res.json({ success: false, code: "ALREADY_ACTIVE", message: "Access already granted" });

    const reqDoc = await PrepAccessRequest.create({
      examId,
      userEmail: email,
      status: "pending",
      intent: intent || "purchase",
      createdAt: new Date(),
    });

    res.json({ success: true, request: reqDoc });
  } catch (e) {
    console.error("request error:", e);
    res.json({ success: false, message: e.message });
  }
});

/* ================================================================== */
/* ADMIN: requests list/approve/revoke                                */
/* ================================================================== */
router.get("/access/requests", isAdmin, async (req, res) => {
  try {
    const { examId, status = "pending", debug } = req.query || {};
    const q = {};
    if (examId) q.examId = String(examId);
    if (status && status !== "all") q.status = status;

    const items = await PrepAccessRequest.find(q).sort({ createdAt: -1 }).limit(200).lean();

    if (debug) {
      const total = await PrepAccessRequest.countDocuments({});
      const pending = await PrepAccessRequest.countDocuments({ status: "pending" });
      const approved = await PrepAccessRequest.countDocuments({ status: "approved" });
      const rejected = await PrepAccessRequest.countDocuments({ status: "rejected" });
      return res.json({ success: true, items, debug: { total, pending, approved, rejected, query: q } });
    }

    res.json({ success: true, items });
  } catch (e) {
    res.status(500).json({ success: false, error: e?.message || "server error" });
  }
});

/* ------------------------------ APPROVE ------------------------------ */
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

    const activeDoc = await grantActiveAccess({ examId: ar.examId, email: ar.userEmail });

    ar.status = "approved";
    ar.approvedAt = new Date();
    ar.approvedBy = "admin";
    await ar.save();

    const unlockHint = {
      message: "approved, unlocking in 15s",
      unlockAt: new Date(Date.now() + 15000).toISOString(),
      access: {
        examId: ar.examId,
        email: ar.userEmail,
        startAt: activeDoc?.startAt,
        planDays: activeDoc?.planDays,
      },
    };

    return res.json({ success: true, request: ar, unlockHint });
  } catch (e) {
    console.error("[prep_access] /access/admin/approve error:", e);
    res.status(500).json({ success: false, error: e?.message || "server error" });
  }
});

router.post("/access/admin/revoke", isAdmin, async (req, res) => {
  try {
    const { examId, email } = req.body || {};
    if (!examId || !email) return res.status(400).json({ success: false, error: "examId & email required" });
    const r = await PrepAccess.updateOne({ examId, userEmail: email.toLowerCase() }, { $set: { status: "revoked" } });
    res.json({ success: true, updated: r.modifiedCount });
  } catch (e) {
    res.status(500).json({ success: false, error: e?.message || "server error" });
  }
});

/* ================================================================== */
/* EXPORT                                                             */
/* ================================================================== */
export default router;
