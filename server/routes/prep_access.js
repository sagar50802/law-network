import express, { Router } from "express";
import mongoose from "mongoose";
import crypto from "crypto";

// ----------------------------------------------------------------------------
// MongoDB Connection (Persistent Storage)
// ----------------------------------------------------------------------------
const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb+srv://user:password@cluster0.mongodb.net/law_network"; // <-- replace with your real URI

if (!mongoose.connection.readyState) {
  mongoose.connect(MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  });
  mongoose.connection.on("connected", () =>
    console.log("[prep_access] ✅ MongoDB connected")
  );
  mongoose.connection.on("error", (err) =>
    console.error("[prep_access] ❌ MongoDB error:", err)
  );
}

// ----------------------------------------------------------------------------
// MongoDB Schemas (replaces JSON file)
// ----------------------------------------------------------------------------
const configSchema = new mongoose.Schema(
  {
    autoGrant: { type: Boolean, default: false },
    priceINR: { type: Number, default: 0 },
    upiId: { type: String, default: "" },
    upiName: { type: String, default: "" },
    whatsappNumber: { type: String, default: "" },
    whatsappText: { type: String, default: "" },
  },
  { _id: false }
);

const requestSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  examId: { type: String, required: true },
  email: { type: String, required: true },
  intent: { type: String, default: "purchase" },
  name: String,
  phone: String,
  note: String,
  status: { type: String, default: "pending" },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const grantSchema = new mongoose.Schema({
  examId: String,
  email: String,
  status: { type: String, default: "active" },
  grantedAt: { type: Date, default: Date.now },
  revokedAt: Date,
});

const dbSchema = new mongoose.Schema({
  config: configSchema,
});

const ConfigModel = mongoose.model("PrepAccessConfig", dbSchema);
const RequestModel = mongoose.model("PrepAccessRequest", requestSchema);
const GrantModel = mongoose.model("PrepAccessGrant", grantSchema);

// ----------------------------------------------------------------------------
// Helper Functions
// ----------------------------------------------------------------------------
const nowISO = () => new Date().toISOString();
const rid = () => crypto.randomBytes(12).toString("hex");
const normEmail = (s) => String(s || "").trim().toLowerCase();
const normExamId = (s) => String(s || "").trim();

async function getConfig() {
  let cfg = await ConfigModel.findOne();
  if (!cfg) {
    cfg = new ConfigModel({
      config: {
        autoGrant: false,
        priceINR: 0,
        upiId: "",
        upiName: "",
        whatsappNumber: "",
        whatsappText: "",
      },
    });
    await cfg.save();
  }
  return cfg.config;
}

async function saveConfig(data) {
  let cfg = await ConfigModel.findOne();
  if (!cfg) cfg = new ConfigModel({ config: data });
  cfg.config = data;
  await cfg.save();
  return cfg.config;
}

async function findActiveGrant(examId, email) {
  return await GrantModel.findOne({
    examId: normExamId(examId),
    email: normEmail(email),
    status: "active",
  });
}

async function upsertGrant(examId, email, status) {
  const g = await GrantModel.findOneAndUpdate(
    { examId: normExamId(examId), email: normEmail(email) },
    {
      $set: {
        status,
        grantedAt: status === "active" ? new Date() : undefined,
        revokedAt: status === "revoked" ? new Date() : undefined,
      },
    },
    { upsert: true, new: true }
  );
  return g;
}

async function latestRequest(examId, email) {
  return await RequestModel.findOne({
    examId: normExamId(examId),
    email: normEmail(email),
  }).sort({ createdAt: -1 });
}

function overlayPayment(cfg) {
  return {
    priceINR: Number(cfg.priceINR || 0),
    upiId: String(cfg.upiId || ""),
    upiName: String(cfg.upiName || ""),
    whatsappNumber: String(cfg.whatsappNumber || ""),
    whatsappText: String(cfg.whatsappText || ""),
  };
}

function adminExamName(examId) {
  const s = String(examId || "").trim();
  return s ? s.toUpperCase() : "COURSE";
}

// ----------------------------------------------------------------------------
// Router Setup
// ----------------------------------------------------------------------------
const router = Router();
router.use(express.json());
router.use(express.text({ type: () => true }));
router.use((req, _res, next) => {
  try {
    if (typeof req.body === "string" && req.body.trim().startsWith("{")) {
      req.body = JSON.parse(req.body);
    }
  } catch {
    req.body = {};
  }
  next();
});

// ----------------------------------------------------------------------------
// PUBLIC ROUTES
// ----------------------------------------------------------------------------

// Guard status
router.get("/api/prep/access/status/guard", async (req, res) => {
  try {
    const examId = normExamId(req.query.examId);
    const email = normEmail(req.query.email);
    if (!examId)
      return res.status(400).json({ success: false, error: "Missing examId" });

    const cfg = await getConfig();
    const active = email ? await findActiveGrant(examId, email) : null;
    const lastReq = email ? await latestRequest(examId, email) : null;

    const access = { status: active ? "active" : "inactive" };
    const exam = {
      id: examId,
      name: adminExamName(examId),
      overlay: { payment: overlayPayment(cfg) },
    };
    let overlay = { mode: "purchase" };
    if (!active && lastReq && lastReq.status === "pending") overlay.mode = "waiting";

    return res.json({ success: true, exam, access, overlay });
  } catch (e) {
    console.error("[status/guard] error:", e);
    return res.status(500).json({ success: false, error: "Internal error" });
  }
});

// Create request
router.post("/api/prep/access/request", async (req, res) => {
  try {
    const { examId, email, intent } = req.body || {};
    const name = String(req.body?.name || "").trim();
    const phone = String(req.body?.phone || "").trim();
    const note = String(req.body?.note || "").trim();

    const ex = normExamId(examId);
    const em = normEmail(email);
    if (!ex || !em)
      return res.status(400).json({ success: false, error: "Missing examId or email" });

    const cfg = await getConfig();

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
      status: "pending",
    });

    let approved = false;
    if (cfg.autoGrant) {
      rec.status = "approved";
      approved = true;
      await upsertGrant(ex, em, "active");
    }

    await rec.save();
    return res.json({ success: true, id: reqId, approved });
  } catch (e) {
    console.error("[access/request] error:", e);
    return res.status(500).json({ success: false, error: e.message });
  }
});

// Poll status
router.get("/api/prep/access/request/status", async (req, res) => {
  try {
    const examId = normExamId(req.query.examId);
    const email = normEmail(req.query.email);
    if (!examId || !email)
      return res.status(400).json({ success: false, error: "Missing examId or email" });

    const last = await latestRequest(examId, email);
    if (!last) return res.json({ success: true, status: null });
    return res.json({ success: true, status: last.status, id: last.id });
  } catch (e) {
    console.error("[request/status] error:", e);
    return res.status(500).json({ success: false, error: "Internal error" });
  }
});

// ----------------------------------------------------------------------------
// ADMIN ROUTES
// ----------------------------------------------------------------------------

// Get config
router.get("/api/admin/prep/access/config", async (_req, res) => {
  try {
    const cfg = await getConfig();
    return res.json({ success: true, config: cfg });
  } catch (e) {
    console.error("[admin/config:get] error:", e);
    return res.status(500).json({ success: false, error: "Internal error" });
  }
});

// Save config
router.post("/api/admin/prep/access/config", async (req, res) => {
  try {
    const b = req.body || {};
    const data = {
      autoGrant: Boolean(b.autoGrant),
      priceINR: Number(b.priceINR || 0),
      upiId: String(b.upiId || ""),
      upiName: String(b.upiName || ""),
      whatsappNumber: String(b.whatsappNumber || ""),
      whatsappText: String(b.whatsappText || ""),
    };
    const cfg = await saveConfig(data);
    return res.json({ success: true, config: cfg });
  } catch (e) {
    console.error("[admin/config:post] error:", e);
    return res.status(500).json({ success: false, error: "Internal error" });
  }
});

// List requests
router.get("/api/admin/prep/access/requests", async (req, res) => {
  try {
    const examId = normExamId(req.query.examId);
    const status = String(req.query.status || "").trim();
    const limit = Math.max(1, Math.min(500, Number(req.query.limit || 50)));

    let q = {};
    if (examId) q.examId = examId;
    if (status) q.status = status;

    const list = await RequestModel.find(q)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    return res.json({ success: true, items: list });
  } catch (e) {
    console.error("[admin/requests:list] error:", e);
    return res.status(500).json({ success: false, error: "Internal error" });
  }
});

// Approve request
router.post("/api/admin/prep/access/approve", async (req, res) => {
  try {
    const { id } = req.body || {};
    let { examId, email } = req.body || {};

    let rec = id
      ? await RequestModel.findOne({ id })
      : await RequestModel.findOne({ examId, email }).sort({ createdAt: -1 });

    if (!rec) return res.status(404).json({ success: false, error: "Request not found" });

    rec.status = "approved";
    rec.updatedAt = new Date();
    await rec.save();
    await upsertGrant(rec.examId, rec.email, "active");

    return res.json({ success: true, request: rec });
  } catch (e) {
    console.error("[admin/approve] error:", e);
    return res.status(500).json({ success: false, error: "Internal error" });
  }
});

// Reject request
router.post("/api/admin/prep/access/reject", async (req, res) => {
  try {
    const { id } = req.body || {};
    let { examId, email } = req.body || {};

    let rec = id
      ? await RequestModel.findOne({ id })
      : await RequestModel.findOne({ examId, email }).sort({ createdAt: -1 });

    if (!rec) return res.status(404).json({ success: false, error: "Request not found" });

    rec.status = "rejected";
    rec.updatedAt = new Date();
    await rec.save();

    return res.json({ success: true, request: rec });
  } catch (e) {
    console.error("[admin/reject] error:", e);
    return res.status(500).json({ success: false, error: "Internal error" });
  }
});

// Revoke
router.post("/api/admin/prep/access/revoke", async (req, res) => {
  try {
    const examId = normExamId(req.body?.examId);
    const email = normEmail(req.body?.email);
    if (!examId || !email)
      return res.status(400).json({ success: false, error: "Missing examId or email" });

    const g = await upsertGrant(examId, email, "revoked");
    return res.json({ success: true, grant: g });
  } catch (e) {
    console.error("[admin/revoke] error:", e);
    return res.status(500).json({ success: false, error: "Internal error" });
  }
});

// Delete
router.post("/api/admin/prep/access/delete", async (req, res) => {
  try {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ success: false, error: "Missing id" });

    const r = await RequestModel.deleteOne({ id });
    return res.json({ success: true, removed: r.deletedCount });
  } catch (e) {
    console.error("[admin/delete] error:", e);
    return res.status(500).json({ success: false, error: "Internal error" });
  }
});

// Batch delete
router.post("/api/admin/prep/access/batch-delete", async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const examId = normExamId(req.body?.examId);
    const emails = Array.isArray(req.body?.emails)
      ? req.body.emails.map(normEmail).filter(Boolean)
      : [];

    const filter = {};
    if (ids.length) filter.id = { $in: ids };
    if (examId) filter.examId = examId;
    if (emails.length) filter.email = { $in: emails };

    const r = await RequestModel.deleteMany(filter);
    return res.json({ success: true, removed: r.deletedCount });
  } catch (e) {
    console.error("[admin/batch-delete] error:", e);
    return res.status(500).json({ success: false, error: "Internal error" });
  }
});

// ----------------------------------------------------------------------------
// Export
// ----------------------------------------------------------------------------
export default router;
