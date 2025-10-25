// prep_access.js — Final production version (Mongo persistent, Render-safe)
// Public + Admin routes fully compatible with your current frontend

import express, { Router } from "express";
import mongoose from "mongoose";
import crypto from "crypto";

/* ----------------------------------------------------------------------------
 * MongoDB connection (persistent storage)
 * ---------------------------------------------------------------------------- */
const MONGO_URI =
  process.env.MONGO_URI ||
  "mongodb+srv://user:password@cluster0.mongodb.net/law_network"; // ← replace with your real URI

if (!mongoose.connection.readyState) {
  mongoose
    .connect(MONGO_URI, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      dbName: process.env.MONGO_DB || undefined,
    })
    .then(() => console.log("[prep_access] ✅ MongoDB connected"))
    .catch((err) => console.error("[prep_access] ❌ MongoDB error:", err.message));
}

/* ----------------------------------------------------------------------------
 * Schemas & Models
 * ---------------------------------------------------------------------------- */
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

const dbSchema = new mongoose.Schema({
  config: configSchema,
});

const requestSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  examId: { type: String, required: true }, // stored as provided; matching is case-insensitive where needed
  email: { type: String, required: true, lowercase: true, trim: true },
  intent: { type: String, default: "purchase" },
  name: String,
  phone: String,
  note: String,
  status: { type: String, default: "pending", enum: ["pending", "approved", "rejected"] },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const grantSchema = new mongoose.Schema({
  examId: { type: String, required: true },
  email: { type: String, required: true, lowercase: true, trim: true },
  status: { type: String, default: "active", enum: ["active", "revoked"] },
  grantedAt: { type: Date, default: Date.now },
  revokedAt: { type: Date },
});

/* Helpful indexes for speed */
requestSchema.index({ examId: 1, email: 1, createdAt: -1 });
grantSchema.index({ examId: 1, email: 1, status: 1 });

const ConfigModel = mongoose.model("PrepAccessConfig", dbSchema);
const RequestModel = mongoose.model("PrepAccessRequest", requestSchema);
const GrantModel = mongoose.model("PrepAccessGrant", grantSchema);

/* ----------------------------------------------------------------------------
 * Helpers
 * ---------------------------------------------------------------------------- */
const rid = () => crypto.randomBytes(12).toString("hex");
const normEmail = (s) => String(s || "").trim().toLowerCase();
const normExamId = (s) => String(s || "").trim();

async function getConfig() {
  let cfgDoc = await ConfigModel.findOne().lean();
  if (!cfgDoc) {
    const seed = new ConfigModel({
      config: {
        autoGrant: false,
        priceINR: 0,
        upiId: "",
        upiName: "",
        whatsappNumber: "",
        whatsappText: "",
      },
    });
    await seed.save();
    cfgDoc = await ConfigModel.findOne().lean();
  }
  return cfgDoc.config || {
    autoGrant: false,
    priceINR: 0,
    upiId: "",
    upiName: "",
    whatsappNumber: "",
    whatsappText: "",
  };
}

async function saveConfig(data) {
  let cfgDoc = await ConfigModel.findOne();
  if (!cfgDoc) cfgDoc = new ConfigModel({ config: data });
  cfgDoc.config = data;
  await cfgDoc.save();
  return cfgDoc.config;
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
  const update =
    status === "active"
      ? { status: "active", grantedAt: now, $unset: { revokedAt: 1 } }
      : { status: "revoked", revokedAt: now };
  const g = await GrantModel.findOneAndUpdate(
    { examId: normExamId(examId), email: normEmail(email) },
    { $set: update },
    { upsert: true, new: true }
  );
  return g;
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

/* ----------------------------------------------------------------------------
 * Router
 * ---------------------------------------------------------------------------- */
const router = Router();

/* Robust body parsing:
   - Accept proper JSON bodies
   - Also tolerate text bodies containing JSON (if client mislabels content-type) */
router.use(express.text({ type: () => true }));
router.use((req, _res, next) => {
  try {
    if (typeof req.body === "string" && req.body.trim().startsWith("{")) {
      req.body = JSON.parse(req.body);
    }
  } catch {
    // ignore; we'll still allow fallback to express.json
  }
  next();
});
router.use(express.json());

/* ----------------------------------------------------------------------------
 * PUBLIC ROUTES
 * ---------------------------------------------------------------------------- */

/* Guard: are we active / inactive, and what should overlay show? */
router.get("/api/prep/access/status/guard", async (req, res) => {
  try {
    const examId = normExamId(req.query.examId);
    const email = normEmail(req.query.email);
    if (!examId) return res.status(400).json({ success: false, error: "Missing examId" });

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

    res.json({ success: true, exam, access, overlay });
  } catch (e) {
    console.error("[status/guard] error:", e);
    res.status(500).json({ success: false, error: "Internal error" });
  }
});

/* Create access request */
router.post("/api/prep/access/request", async (req, res) => {
  try {
    const { examId, email, intent } = req.body || {};
    const name = String(req.body?.name || "").trim();
    const phone = String(req.body?.phone || "").trim();
    const note = String(req.body?.note || "").trim();

    const ex = normExamId(examId);
    const em = normEmail(email);
    if (!ex || !em) {
      return res.status(400).json({ success: false, error: "Missing examId or email" });
    }

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
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    let approved = false;
    if (cfg.autoGrant) {
      rec.status = "approved";
      rec.updatedAt = new Date();
      await upsertGrant(ex, em, "active");
      approved = true;
    }

    await rec.save();
    res.json({ success: true, id: reqId, approved });
  } catch (e) {
    console.error("[access/request] error:", e);
    res.status(500).json({ success: false, error: e.message || "Internal error" });
  }
});

/* Poll last request status */
router.get("/api/prep/access/request/status", async (req, res) => {
  try {
    const examId = normExamId(req.query.examId);
    const email = normEmail(req.query.email);
    if (!examId || !email) {
      return res.status(400).json({ success: false, error: "Missing examId or email" });
    }

    const last = await latestRequest(examId, email);
    if (!last) return res.json({ success: true, status: null });
    res.json({ success: true, status: last.status, id: last.id });
  } catch (e) {
    console.error("[request/status] error:", e);
    res.status(500).json({ success: false, error: "Internal error" });
  }
});

/* ----------------------------------------------------------------------------
 * ADMIN ROUTES
 * ---------------------------------------------------------------------------- */

/* Get config */
router.get("/api/admin/prep/access/config", async (_req, res) => {
  try {
    const cfg = await getConfig();
    res.json({ success: true, config: cfg });
  } catch (e) {
    console.error("[admin/config:get] error:", e);
    res.status(500).json({ success: false, error: "Internal error" });
  }
});

/* Save config */
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
    res.json({ success: true, config: cfg });
  } catch (e) {
    console.error("[admin/config:post] error:", e);
    res.status(500).json({ success: false, error: "Internal error" });
  }
});

/* List requests (case-insensitive examId; supports no examId for global view) */
router.get("/api/admin/prep/access/requests", async (req, res) => {
  try {
    const examId = normExamId(req.query.examId);
    const status = String(req.query.status || "").trim();
    const limit = Math.max(1, Math.min(500, Number(req.query.limit || 50)));

    const q = {};
    if (examId) q.examId = new RegExp(`^${examId}$`, "i"); // tolerant match
    if (status) q.status = status;

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

/* Approve latest request for (examId,email) or by id */
router.post("/api/admin/prep/access/approve", async (req, res) => {
  try {
    const { id } = req.body || {};
    let { examId, email } = req.body || {};

    let rec = null;
    if (id) {
      rec = await RequestModel.findOne({ id });
    } else if (examId && email) {
      rec = await RequestModel.findOne({
        examId: new RegExp(`^${normExamId(examId)}$`, "i"),
        email: normEmail(email),
      })
        .sort({ createdAt: -1 })
        .exec();
    }
    if (!rec) return res.status(404).json({ success: false, error: "Request not found" });

    rec.status = "approved";
    rec.updatedAt = new Date();
    await rec.save();

    await upsertGrant(rec.examId, rec.email, "active");

    res.json({ success: true, request: rec.toObject() });
  } catch (e) {
    console.error("[admin/approve] error:", e);
    res.status(500).json({ success: false, error: "Internal error" });
  }
});

/* Reject */
router.post("/api/admin/prep/access/reject", async (req, res) => {
  try {
    const { id } = req.body || {};
    let { examId, email } = req.body || {};

    let rec = null;
    if (id) {
      rec = await RequestModel.findOne({ id });
    } else if (examId && email) {
      rec = await RequestModel.findOne({
        examId: new RegExp(`^${normExamId(examId)}$`, "i"),
        email: normEmail(email),
      })
        .sort({ createdAt: -1 })
        .exec();
    }
    if (!rec) return res.status(404).json({ success: false, error: "Request not found" });

    rec.status = "rejected";
    rec.updatedAt = new Date();
    await rec.save();

    res.json({ success: true, request: rec.toObject() });
  } catch (e) {
    console.error("[admin/reject] error:", e);
    res.status(500).json({ success: false, error: "Internal error" });
  }
});

/* Revoke active grant */
router.post("/api/admin/prep/access/revoke", async (req, res) => {
  try {
    const examId = normExamId(req.body?.examId);
    const email = normEmail(req.body?.email);
    if (!examId || !email) {
      return res.status(400).json({ success: false, error: "Missing examId or email" });
    }

    const g = await upsertGrant(examId, email, "revoked");
    res.json({ success: true, grant: g.toObject() });
  } catch (e) {
    console.error("[admin/revoke] error:", e);
    res.status(500).json({ success: false, error: "Internal error" });
  }
});

/* Delete one request by id */
router.post("/api/admin/prep/access/delete", async (req, res) => {
  try {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ success: false, error: "Missing id" });

    const r = await RequestModel.deleteOne({ id });
    res.json({ success: true, removed: r.deletedCount || 0 });
  } catch (e) {
    console.error("[admin/delete] error:", e);
    res.status(500).json({ success: false, error: "Internal error" });
  }
});

/* Batch delete by ids (or optional examId+emails) */
router.post("/api/admin/prep/access/batch-delete", async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const examId = normExamId(req.body?.examId);
    const emails = Array.isArray(req.body?.emails)
      ? req.body.emails.map(normEmail).filter(Boolean)
      : [];

    const filter = {};
    if (ids.length) filter.id = { $in: ids };
    if (examId) filter.examId = new RegExp(`^${examId}$`, "i");
    if (emails.length) filter.email = { $in: emails };

    if (!Object.keys(filter).length) {
      return res.json({ success: true, removed: 0 });
    }

    const r = await RequestModel.deleteMany(filter);
    res.json({ success: true, removed: r.deletedCount || 0 });
  } catch (e) {
    console.error("[admin/batch-delete] error:", e);
    res.status(500).json({ success: false, error: "Internal error" });
  }
});

/* ----------------------------------------------------------------------------
 * Export
 * ---------------------------------------------------------------------------- */
export default router;
