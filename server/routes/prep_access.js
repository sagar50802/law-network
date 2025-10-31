// prep_access.js — Final merged production version (Mongo persistent, Render-safe)
// Combines: old 487-line full implementation + new flattened schema + per-exam support
// ✅ Fully compatible with PrepAccessAdmin.jsx (2025-10 build)

import express, { Router } from "express";
import mongoose from "mongoose";
import crypto from "crypto";

/* ----------------------------------------------------------------------------
 * MongoDB connection (persistent)
 * ---------------------------------------------------------------------------- */
const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb+srv://user:password@cluster0.mongodb.net/law_network"; // replace with your URI

if (!mongoose.connection.readyState) {
  mongoose
    .connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      dbName: process.env.MONGO_DB || undefined,
    })
    .then(() => console.log("[prep_access] ✅ MongoDB connected"))
    .catch((err) =>
      console.error("[prep_access] ❌ MongoDB error:", err.message)
    );
}

/* ----------------------------------------------------------------------------
 * Schemas & Models
 * ---------------------------------------------------------------------------- */
const configSchema = new mongoose.Schema(
  {
    examId: { type: String, default: "" },
    overlayMode: { type: String, default: "planDayTime" },
    course: { type: String, default: "" },
    price: { type: Number, default: 0 },
    trialDays: { type: Number, default: 0 },
    autoGrant: { type: Boolean, default: false },
    upiId: { type: String, default: "" },
    upiName: { type: String, default: "" },
    whatsappNumber: { type: String, default: "" },
    whatsappText: { type: String, default: "" },
  },
  { timestamps: true, collection: "prepaccessconfigs" }
);

const requestSchema = new mongoose.Schema(
  {
    id: { type: String, required: true, unique: true },
    examId: { type: String, required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    intent: { type: String, default: "purchase" },
    name: String,
    phone: String,
    note: String,
    status: {
      type: String,
      default: "pending",
      enum: ["pending", "approved", "rejected"],
    },
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: "prepaccessrequests" }
);

const grantSchema = new mongoose.Schema(
  {
    examId: { type: String, required: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    status: { type: String, default: "active", enum: ["active", "revoked"] },
    grantedAt: { type: Date, default: Date.now },
    revokedAt: { type: Date },
  },
  { collection: "prepaccessgrants" }
);

requestSchema.index({ examId: 1, email: 1, createdAt: -1 });
grantSchema.index({ examId: 1, email: 1, status: 1 });

const ConfigModel = mongoose.model("PrepAccessConfig", configSchema);
const RequestModel = mongoose.model("PrepAccessRequest", requestSchema);
const GrantModel = mongoose.model("PrepAccessGrant", grantSchema);

/* ----------------------------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------------------------- */
const rid = () => crypto.randomBytes(12).toString("hex");
const normEmail = (s) => String(s || "").trim().toLowerCase();
const normExamId = (s) =>
  String(s || "").trim().toLowerCase().replace(/\s+/g, "");

async function getConfig(examId) {
  let cfg = null;
  if (examId)
    cfg = await ConfigModel.findOne({
      examId: new RegExp(`^${normExamId(examId)}$`, "i"),
    }).lean();
  if (!cfg) cfg = await ConfigModel.findOne().lean();
  if (!cfg) {
    cfg = await ConfigModel.create({
      examId: examId || "",
      overlayMode: "planDayTime",
      course: (examId || "COURSE").toUpperCase(),
      price: 0,
      trialDays: 0,
      autoGrant: false,
      upiId: "lawnetwork@upi",
      upiName: "Law Network",
      whatsappNumber: "+919999999999",
      whatsappText: "Hello, I would like to purchase access",
    });
    cfg = cfg.toObject();
  }
  // 🔧 ensure old configs have required keys
  const patch = {};
  if (!cfg.upiId) patch.upiId = "lawnetwork@upi";
  if (!cfg.upiName) patch.upiName = "Law Network";
  if (!cfg.whatsappNumber) patch.whatsappNumber = "+919999999999";
  if (!cfg.whatsappText)
    patch.whatsappText = "Hello, I would like to purchase access";

  if (Object.keys(patch).length) {
    await ConfigModel.updateOne({ _id: cfg._id }, { $set: patch });
    cfg = { ...cfg, ...patch };
  }
  return cfg;
}

async function saveConfig(data) {
  const examId = normExamId(data.examId || "");
  let cfg = await ConfigModel.findOne({ examId });
  if (!cfg) cfg = new ConfigModel({});
  Object.assign(cfg, data);
  await cfg.save();
  return cfg.toObject();
}

async function findActiveGrant(examId, email) {
  return GrantModel.findOne({
    examId: normExamId(examId),
    email: normEmail(email),
    status: "active",
  }).lean();
}

async function upsertGrant(examId, email, status) {
  const now = new Date();
  if (status === "active") {
    return GrantModel.findOneAndUpdate(
      { examId: normExamId(examId), email: normEmail(email) },
      {
        $set: { status: "active", grantedAt: now },
        $unset: { revokedAt: 1 },
      },
      { upsert: true, new: true }
    );
  } else {
    return GrantModel.findOneAndUpdate(
      { examId: normExamId(examId), email: normEmail(email) },
      { $set: { status: "revoked", revokedAt: now } },
      { upsert: false, new: true }
    );
  }
}

async function latestRequest(examId, email) {
  return RequestModel.findOne({
    examId: normExamId(examId),
    email: normEmail(email),
  })
    .sort({ createdAt: -1 })
    .lean();
}

function overlayPayment(cfg) {
  return {
    priceINR: Number(cfg.price || 0),
    upiId: String(cfg.upiId || ""),
    upiName: String(cfg.upiName || ""),
    whatsappNumber: String(cfg.whatsappNumber || ""),
    whatsappText: String(cfg.whatsappText || ""),
  };
}

/* ----------------------------------------------------------------------------
 * Router setup
 * ---------------------------------------------------------------------------- */
const router = Router();

/* Body parsing middleware */
router.use(express.text({ type: () => true }));
router.use((req, _res, next) => {
  try {
    if (typeof req.body === "string" && req.body.trim().startsWith("{")) {
      req.body = JSON.parse(req.body);
    }
  } catch {
    // ignore malformed JSON bodies
  }
  next();
});
router.use(express.json());

/* ----------------------------------------------------------------------------
 * PUBLIC ROUTES
 * ---------------------------------------------------------------------------- */

/**
 * ✅ Guard route — used by client to detect if a user already has access.
 */
router.get("/api/prep/access/status/guard", async (req, res) => {
  try {
    const examId = normExamId(req.query.examId);
    const email = normEmail(req.query.email);
    if (!examId)
      return res.status(400).json({ success: false, error: "Missing examId" });

    const cfg = await getConfig(examId);
    const active = email ? await findActiveGrant(examId, email) : null;
    const lastReq = email ? await latestRequest(examId, email) : null;

    let overlay = { mode: "purchase" };
    if (!active && lastReq?.status === "pending") overlay.mode = "waiting";

    const access = { status: active ? "active" : "inactive" };
    const exam = {
      id: examId,
      name: (examId || "").toUpperCase(),
      overlay: { payment: overlayPayment(cfg) },
    };

    res.json({ success: true, exam, access, overlay });
  } catch (e) {
    console.error("[status/guard] error:", e);
    res.status(500).json({ success: false, error: "Internal error" });
  }
});

/**
 * ✅ Create access request
 */
router.post("/api/prep/access/request", async (req, res) => {
  try {
    const { examId, email, intent, name, phone, note } = req.body || {};
    const ex = normExamId(examId);
    const em = normEmail(email);
    if (!ex || !em)
      return res
        .status(400)
        .json({ success: false, error: "Missing examId or email" });

    const cfg = await getConfig(ex);
    const already = await findActiveGrant(ex, em);
    if (already) return res.json({ success: true, code: "ALREADY_ACTIVE" });

    const reqId = rid();
    const rec = new RequestModel({
      id: reqId,
      examId: ex,
      email: em,
      intent: intent === "restart" ? "restart" : "purchase",
      name,
      phone,
      note,
      status: cfg.autoGrant ? "approved" : "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await rec.save();
    if (cfg.autoGrant) await upsertGrant(ex, em, "active");

    res.json({ success: true, id: reqId, approved: cfg.autoGrant });
  } catch (e) {
    console.error("[access/request] error:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

/**
 * ✅ Poll request status
 */
router.get("/api/prep/access/request/status", async (req, res) => {
  try {
    const examId = normExamId(req.query.examId);
    const email = normEmail(req.query.email);
    if (!examId || !email)
      return res
        .status(400)
        .json({ success: false, error: "Missing examId or email" });
    const last = await latestRequest(examId, email);
    if (!last) return res.json({ success: true, status: null });
    res.json({ success: true, status: last.status, id: last.id });
  } catch (e) {
    console.error("[request/status] error:", e);
    res.status(500).json({ success: false, error: "Internal error" });
  }
});

/**
 * ✅ Public exam meta — Fixes “Failed to load admin data”
 */
router.get("/api/prep/public/exams/:examId/meta", async (req, res) => {
  try {
    const examId = normExamId(req.params.examId);
    const cfg = await getConfig(examId);
    if (!cfg)
      return res.status(404).json({ success: false, error: "Config not found" });

    const exam = {
      id: examId,
      name: (cfg.course || examId).toUpperCase(),
      overlay: { mode: cfg.overlayMode, payment: overlayPayment(cfg) },
      price: cfg.price,
      trialDays: cfg.trialDays,
    };
    res.json({ success: true, exam });
  } catch (e) {
    console.error("[public/exams/meta] error:", e);
    res.status(500).json({ success: false, error: "Internal error" });
  }
});

/* ----------------------------------------------------------------------------
 * ADMIN ROUTES
 * ---------------------------------------------------------------------------- */

router.get("/api/admin/prep/access/config", async (req, res) => {
  try {
    const examId = normExamId(req.query.examId || "");
    const cfg = await getConfig(examId);
    res.json({ success: true, config: cfg });
  } catch (e) {
    console.error("[admin/config:get] error:", e);
    res.status(500).json({ success: false, error: "Internal error" });
  }
});

router.post("/api/admin/prep/access/config", async (req, res) => {
  try {
    const b = req.body || {};
    const data = {
      examId: normExamId(b.examId || ""),
      overlayMode: b.overlayMode || "planDayTime",
      course: String(b.course || "").toUpperCase(),
      price: Number(b.price || b.priceINR || 0),
      trialDays: Number(b.trialDays || 0),
      autoGrant: Boolean(b.autoGrant),
      upiId: String(b.upiId || "").trim(),
      upiName: String(b.upiName || "").trim(),
      whatsappNumber: String(b.whatsappNumber || "").trim(),
      whatsappText: String(b.whatsappText || "").trim(),
    };
    const cfg = await saveConfig(data);
    res.json({ success: true, config: cfg });
  } catch (e) {
    console.error("[admin/config:post] error:", e);
    res.status(500).json({ success: false, error: "Internal error" });
  }
});

router.get("/api/admin/prep/access/requests", async (req, res) => {
  try {
    const examId = normExamId(req.query.examId);
    const status = String(req.query.status || "").trim();
    const limit = Math.max(1, Math.min(500, Number(req.query.limit || 100)));

    const q = {};
    if (examId) q.examId = new RegExp(`^${examId}$`, "i");
    if (status && status !== "all") q.status = status;

    const list = await RequestModel.find(q)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.json({ success: true, items: list });
  } catch (e) {
    console.error("[admin/requests:list] error:", e);
    res.status(500).json({ success: false, error: "Internal error" });
  }
});

router.post("/api/admin/prep/access/approve", async (req, res) => {
  try {
    const { examId, email } = req.body || {};
    if (!examId || !email)
      return res
        .status(400)
        .json({ success: false, error: "Missing examId or email" });

    const rec = await RequestModel.findOneAndUpdate(
      { examId: normExamId(examId), email: normEmail(email) },
      { $set: { status: "approved", updatedAt: new Date() } },
      { new: true }
    );
    if (!rec)
      return res.status(404).json({ success: false, error: "Request not found" });

    await upsertGrant(examId, email, "active");
    res.json({ success: true, request: rec.toObject() });
  } catch (e) {
    console.error("[admin/approve] error:", e);
    res.status(500).json({ success: false, error: "Internal error" });
  }
});

router.post("/api/admin/prep/access/reject", async (req, res) => {
  try {
    const { examId, email } = req.body || {};
    if (!examId || !email)
      return res
        .status(400)
        .json({ success: false, error: "Missing examId or email" });

    const rec = await RequestModel.findOneAndUpdate(
      { examId: normExamId(examId), email: normEmail(email) },
      { $set: { status: "rejected", updatedAt: new Date() } },
      { new: true }
    );
    if (!rec)
      return res.status(404).json({ success: false, error: "Request not found" });

    res.json({ success: true, request: rec.toObject() });
  } catch (e) {
    console.error("[admin/reject] error:", e);
    res.status(500).json({ success: false, error: "Internal error" });
  }
});

router.post("/api/admin/prep/access/revoke", async (req, res) => {
  try {
    const examId = normExamId(req.body?.examId);
    const email = normEmail(req.body?.email);
    if (!examId || !email)
      return res
        .status(400)
        .json({ success: false, error: "Missing examId or email" });

    const g = await upsertGrant(examId, email, "revoked");
    res.json({ success: true, grant: g.toObject() });
  } catch (e) {
    console.error("[admin/revoke] error:", e);
    res.status(500).json({ success: false, error: "Internal error" });
  }
});

router.post("/api/admin/prep/access/delete", async (req, res) => {
  try {
    const { id } = req.body || {};
    if (!id)
      return res.status(400).json({ success: false, error: "Missing id" });

    const r = await RequestModel.deleteOne({ id });
    res.json({ success: true, removed: r.deletedCount || 0 });
  } catch (e) {
    console.error("[admin/delete] error:", e);
    res.status(500).json({ success: false, error: "Internal error" });
  }
});

router.post("/api/admin/prep/access/batch-delete", async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    if (!ids.length)
      return res.status(400).json({ success: false, error: "No IDs provided" });

    const r = await RequestModel.deleteMany({ id: { $in: ids } });
    res.json({ success: true, removed: r.deletedCount || 0 });
  } catch (e) {
    console.error("[admin/batch-delete] error:", e);
    res.status(500).json({ success: false, error: "Internal error" });
  }
});

/* ----------------------------------------------------------------------------
 * Export
 * ---------------------------------------------------------------------------- */
export { getConfig };
export default router;
