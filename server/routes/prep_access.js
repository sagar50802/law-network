// server/routes/prep_access.js
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
/* Uploads                                                             */
/* ------------------------------------------------------------------ */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 40 * 1024 * 1024 }, // 40 MB
});

// Used when we accept JSON instead of multipart
const jsonBody = express.json();

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
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
/* Optional R2, fallback GridFS                                        */
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

/* ------------------------------------------------------------------ */
/* Plan helpers                                                        */
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
    { examId, userEmail: email },
    { $set: { status: "active", planDays, startAt: now }, $inc: { cycle: 1 } },
    { upsert: true, new: true }
  );
  return doc;
}

/* ------------------------------------------------------------------ */
/* Router                                                              */
/* ------------------------------------------------------------------ */
const router = express.Router();

/* ================================================================== */
/* ADMIN: Overlay UI uploads (banner/qr)                               */
/* ================================================================== */

router.get("/overlay/:examId", isAdmin, async (req, res) => {
  const exam = await PrepExam.findOne(
    { examId: req.params.examId },
    { overlayUI:1, price:1, trialDays:1, name:1, examId:1 }
  ).lean();
  if (!exam) return res.status(404).json({ success:false, message:"Exam not found" });
  res.json({ success:true, config: exam.overlayUI || {}, exam });
});

router.post(
  "/overlay/:examId",
  isAdmin,
  upload.fields([{ name:"banner" }, { name:"whatsappQR" }]),
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
        buffer:f.buffer, filename:f.originalname, mime:f.mimetype, bucket:"prep-overlay"
      });
      bannerUrl = s.url;
    }
    if (req.files?.whatsappQR?.[0]) {
      const f = req.files.whatsappQR[0];
      const s = await storeBuffer({
        buffer:f.buffer, filename:f.originalname, mime:f.mimetype, bucket:"prep-overlay"
      });
      whatsappQRUrl = s.url;
    }

    const overlayUI = {
      upiId: String(upiId).trim(),
      upiName: String(upiName || "").trim(),
      priceINR: Number(priceINR || 0),
      whatsappLink: whatsappId ? `https://wa.me/${String(whatsappId).replace(/\D/g,"")}` : "",
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

    const doc = await PrepExam.findOneAndUpdate({ examId }, { $set: update }, { new:true }).lean();
    res.json({ success:true, exam:doc });
  }
);

/* ================================================================== */
/* ADMIN: Read/Write exam overlay/payment config                       */
/* ================================================================== */

router.get("/exams/:examId/meta", isAdmin, async (req, res) => {
  const exam = await PrepExam.findOne({ examId: req.params.examId }).lean();
  if (!exam) return res.status(404).json({ success:false, message:"Exam not found" });
  const { price=0, trialDays=3, overlay={}, payment={}, autoGrantRestart=false } = exam;
  res.json({
    success:true,
    price, trialDays, overlay, payment,
    autoGrantRestart: !!autoGrantRestart,
    name: exam.name, examId: exam.examId
  });
});

router.patch("/exams/:examId/overlay-config", isAdmin, async (req, res) => {
  const {
    price, trialDays,
    mode, offsetDays, fixedAt, showOnDay, showAtLocal, tz,
    upiId, upiName, whatsappNumber, whatsappText,
    autoGrantRestart,
  } = req.body || {};
  const p = (req.body && req.body.payment) || {};

  const effUpiId = (upiId ?? p.upiId) ? sanitizeUpiId(upiId ?? p.upiId) : "";
  const effUpiName = (upiName ?? p.upiName) ? sanitizeText(upiName ?? p.upiName) : "";
  const effWhatsappNumber = (whatsappNumber ?? p.whatsappNumber ?? p.waPhone)
    ? sanitizePhone(whatsappNumber ?? p.whatsappNumber ?? p.waPhone) : "";
  const effWhatsappText = (whatsappText ?? p.whatsappText ?? p.waText)
    ? sanitizeText(whatsappText ?? p.whatsappText ?? p.waText) : "";

  const hasPay = !!(effUpiId || effUpiName || effWhatsappNumber || effWhatsappText);

  const update = {
    ...(price != null ? { price: Number(price) } : {}),
    ...(trialDays != null ? { trialDays: Number(trialDays) } : {}),
    ...(autoGrantRestart != null ? { autoGrantRestart: !!autoGrantRestart } : {}),
    overlay: {
      ...(mode ? { mode } : {}),
      ...(offsetDays != null ? { offsetDays: Number(offsetDays) } : {}),
      ...(fixedAt ? { fixedAt: new Date(fixedAt) } : { fixedAt: null }),
      ...(showOnDay != null ? { showOnDay: Number(showOnDay) } : {}),
      ...(showAtLocal ? { showAtLocal: String(showAtLocal) } : {}),
      ...(tz ? { tz: String(tz) } : {}),
      ...(hasPay ? {
        payment: {
          ...(effUpiId ? { upiId: effUpiId } : {}),
          ...(effUpiName ? { upiName: effUpiName } : {}),
          ...(effWhatsappNumber ? { whatsappNumber: effWhatsappNumber } : {}),
          ...(effWhatsappText ? { whatsappText: effWhatsappText } : {}),
        }
      } : {}),
    },
  };

  if (update.overlay?.mode === "planDayTime" && !("tz" in update.overlay)) {
    update.overlay.tz = "Asia/Kolkata";
  }

  const doc = await PrepExam.findOneAndUpdate({ examId: req.params.examId }, { $set: update }, { new:true }).lean();
  res.json({ success:true, exam:doc });
});

/* ================================================================== */
/* PUBLIC: create request + poll                                       */
/* ================================================================== */

function firstFile(req, ...names) {
  for (const n of names) { const f = req.files?.[n]?.[0]; if (f) return f; }
  if (req.file) return req.file;
  return null;
}
const acceptProofUpload = upload.fields([
  { name:"screenshot", maxCount:1 },
  { name:"file", maxCount:1 },
  { name:"image", maxCount:1 },
  { name:"proof", maxCount:1 },
]);

// Create an access request (accepts multipart or JSON)
router.post(
  "/access/request",
  (req, res, next) => {
    const ct = (req.headers["content-type"] || "").toLowerCase();
    if (ct.includes("multipart/form-data")) return acceptProofUpload(req, res, next);
    return jsonBody(req, res, next);
  },
  async (req, res) => {
    try {
      if (!mongoose.connection?.db) {
        return res.status(503).json({ success:false, error:"database not connected" });
      }

      const b = req.body || {};
      const examId = String(b.examId || "").trim();
      const email  = String(b.email || b.userEmail || "").trim().toLowerCase();
      const note   = sanitizeText(b.note);
      const name   = sanitizeText(b.name);
      const phone  = sanitizePhone(b.phone);
      const planKey   = sanitizeText(b.planKey);
      const planLabel = sanitizeText(b.planLabel);
      const planPrice = b.planPrice != null ? Number(b.planPrice) : undefined;

      if (!examId || !email) {
        return res.status(400).json({ success:false, error:"examId & email required" });
      }

      // intent: explicit or infer from current access
      let intent = String(b.intent || "").trim();
      if (!intent) {
        const existing = await PrepAccess.findOne({ examId, userEmail: email }).lean();
        intent = existing?.status === "active" ? "restart" : "purchase";
      }

      // optional proof image
      let screenshotUrl = "";
      const f = firstFile(req, "screenshot","file","image","proof");
      if (f?.buffer?.length) {
        const saved = await storeBuffer({
          buffer: f.buffer,
          filename: f.originalname || "payment.jpg",
          mime: f.mimetype || "application/octet-stream",
          bucket: "prep-proof",
        });
        screenshotUrl = saved.url;
      }

      const exam = await PrepExam.findOne({ examId }).lean();
      const priceAt = Number(exam?.price || planPrice || 0);
      const autoGrant = !!exam?.autoGrantRestart;

      const reqDoc = await PrepAccessRequest.create({
        examId,
        userEmail: email,
        intent,
        screenshotUrl,
        note,
        status: "pending",
        priceAt,
        meta: {
          name,
          phone,
          planKey,
          planLabel,
          planPrice: planPrice || undefined,
        },
      });

      if (!reqDoc?._id) {
        return res.status(500).json({ success:false, error:"request not saved" });
      }

      // helpful log
      console.log("[prep_access] created request", {
        requestId: String(reqDoc._id), examId, email, intent
      });

      if (autoGrant) {
        await grantActiveAccess({ examId, email });
        await PrepAccessRequest.updateOne(
          { _id: reqDoc._id },
          { $set: { status:"approved", approvedAt:new Date(), approvedBy:"auto" } }
        );
        return res.json({
          success:true,
          approved:true,
          requestId:String(reqDoc._id),
          examId, email, intent,
        });
      }

      res.json({
        success:true,
        approved:false,
        requestId:String(reqDoc._id),
        examId, email, intent,
      });
    } catch (e) {
      console.error("[prep_access] /access/request failed:", e);
      res.status(500).json({ success:false, error:e?.message || "server error" });
    }
  }
);

// Poll status of latest request (for “waiting...”)
router.get("/access/request/status", async (req, res) => {
  try {
    const { examId, email } = req.query || {};
    if (!examId || !email) return res.status(400).json({ success:false, error:"examId & email required" });

    const item = await PrepAccessRequest
      .findOne({ examId, userEmail: email })
      .sort({ createdAt: -1 })
      .lean();

    if (!item) return res.json({ success:true, status:"none" });
    res.json({ success:true, status: item.status, requestId: String(item._id) });
  } catch (e) {
    res.status(500).json({ success:false, error:e?.message || "server error" });
  }
});

/* ================================================================== */
/* ADMIN: requests list/approve/revoke                                  */
/* ================================================================== */

// status=all → return all; debug=1 → include counts meta
router.get("/access/requests", isAdmin, async (req, res) => {
  try {
    const { examId, status = "pending", debug } = req.query || {};

    // normalize status so "All"/"ALL"/"Pending" etc. work
    const statusNorm = String(status || "").trim().toLowerCase();

    const q = {};
    if (examId) q.examId = examId;
    if (statusNorm && statusNorm !== "all") q.status = statusNorm;

    const items = await PrepAccessRequest.find(q).sort({ createdAt:-1 }).limit(200).lean();

    if (debug) {
      const total    = await PrepAccessRequest.countDocuments({});
      const pending  = await PrepAccessRequest.countDocuments({ status:"pending" });
      const approved = await PrepAccessRequest.countDocuments({ status:"approved" });
      const rejected = await PrepAccessRequest.countDocuments({ status:"rejected" });
      return res.json({ success:true, items, debug: { total, pending, approved, rejected, query:q, statusNorm } });
    }

    res.json({ success:true, items });
  } catch (e) {
    res.status(500).json({ success:false, error:e?.message || "server error" });
  }
});

router.post("/access/admin/approve", isAdmin, async (req, res) => {
  try {
    const { requestId, approve = true } = req.body || {};
    const ar = await PrepAccessRequest.findById(requestId);
    if (!ar) return res.status(404).json({ success:false, error:"request not found" });

    if (!approve) {
      ar.status = "rejected";
      await ar.save();
      return res.json({ success:true, request: ar });
    }

    await grantActiveAccess({ examId: ar.examId, email: ar.userEmail });
    ar.status = "approved";
    ar.approvedAt = new Date();
    ar.approvedBy = "admin";
    await ar.save();

    res.json({ success:true, request: ar });
  } catch (e) {
    res.status(500).json({ success:false, error:e?.message || "server error" });
  }
});

router.post("/access/admin/revoke", isAdmin, async (req, res) => {
  try {
    const { examId, email } = req.body || {};
    if (!examId || !email) return res.status(400).json({ success:false, error:"examId & email required" });
    const r = await PrepAccess.updateOne({ examId, userEmail: email }, { $set:{ status:"revoked" } });
    res.json({ success:true, updated: r.modifiedCount });
  } catch (e) {
    res.status(500).json({ success:false, error:e?.message || "server error" });
  }
});

/* ================================================================== */
/* QUICK ADMIN (URL toggle with key)                                    */
/* ================================================================== */

function isAdminLoose(req, res, next) {
  const key = req.get("X-Owner-Key") || req.query._k || (req.body && req.body._k);
  const ok = key && key === (process.env.ADMIN_KEY || process.env.VITE_OWNER_KEY || "");
  if (!ok) return res.status(401).json({ success:false, error:"Unauthorized" });
  next();
}

router.get("/exams/:examId/overlay-quick-set", isAdminLoose, async (req, res) => {
  try {
    const examId = req.params.examId;
    const {
      price, trialDays, mode, offsetDays, fixedAt, showOnDay, showAtLocal, tz,
      upi: upiId, upn: upiName, wa: whatsappNumber, wat: whatsappText,
      autoGrantRestart,
    } = req.query || {};

    const overlay = {};
    if (mode) overlay.mode = String(mode);
    if (offsetDays != null) overlay.offsetDays = Number(offsetDays);
    if (fixedAt) overlay.fixedAt = new Date(fixedAt);
    if (showOnDay != null) overlay.showOnDay = Number(showOnDay);
    if (showAtLocal) overlay.showAtLocal = String(showAtLocal);
    if (tz) overlay.tz = String(tz);

    const payment = {};
    if (upiId) payment.upiId = String(upiId).trim();
    if (upiName) payment.upiName = String(upiName).trim();
    if (whatsappNumber) payment.whatsappNumber = String(whatsappNumber).trim();
    if (whatsappText) payment.whatsappText = String(whatsappText).trim();
    if (Object.keys(payment).length) overlay.payment = payment;

    const update = {
      ...(price != null ? { price: Number(price) } : {}),
      ...(trialDays != null ? { trialDays: Number(trialDays) } : {}),
      ...(autoGrantRestart != null ? { autoGrantRestart: truthy(autoGrantRestart) } : {}),
      ...(Object.keys(overlay).length ? { overlay } : {}),
    };

    if (update.overlay?.mode === "planDayTime" && !("tz" in update.overlay)) {
      update.overlay.tz = "Asia/Kolkata";
    }

    const doc = await PrepExam.findOneAndUpdate({ examId }, { $set: update }, { new:true }).lean();
    res.json({ success:true, exam:doc, applied:update });
  } catch (e) {
    res.status(500).json({ success:false, error:e?.message || "server error" });
  }
});

export default router;
