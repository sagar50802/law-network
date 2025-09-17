// server/routes/submissions.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const mongoose = require("mongoose");

const router = express.Router();

const DATA_DIR  = path.join(__dirname, "..", "data");
const UP_DIR    = path.join(__dirname, "..", "uploads", "submissions");
const DATA_FILE = path.join(DATA_DIR, "submissions.json");
const AUTO_FILE = path.join(DATA_DIR, "submissions.auto.json");

// ensure folders/files
[DATA_DIR, UP_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, "[]");
if (!fs.existsSync(AUTO_FILE)) fs.writeFileSync(AUTO_FILE, JSON.stringify({ auto: false }, null, 2));

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UP_DIR),
  filename: (_req, file, cb) => cb(null, `${Date.now()}${path.extname(file.originalname || "")}`),
});
const upload = multer({ storage });

function readAll() { try { return JSON.parse(fs.readFileSync(DATA_FILE, "utf8")) || []; } catch { return []; } }
function writeAll(arr) { fs.writeFileSync(DATA_FILE, JSON.stringify(arr, null, 2)); }
function getAutoMode() { try { return !!(JSON.parse(fs.readFileSync(AUTO_FILE, "utf8")) || {}).auto; } catch { return false; } }
function setAutoMode(auto) { fs.writeFileSync(AUTO_FILE, JSON.stringify({ auto: !!auto }, null, 2)); }

function isAdmin(req, res, next) {
  const hdr = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const x   = req.headers["x-owner-key"] || req.headers["X-Owner-Key"];
  const token = hdr || x || "";
  if (token && token === req.ADMIN_KEY) return next();
  return res.status(401).json({ success:false, message:"Unauthorized" });
}

/* ------------------------- Access model (Mongo) -------------------------- */

const AccessSchema = new mongoose.Schema({
  email:    { type: String, required: true },
  feature:  { type: String, required: true },  // playlist, video, pdf, podcast, article
  featureId:{ type: String, required: true },
  expiry:   { type: Date },
  message:  { type: String },
}, { timestamps: true });

const Access = mongoose.models.Access || mongoose.model("Access", AccessSchema);

/* ------------------------- SSE: live grant/revoke ------------------------ */

const clientsByEmail = new Map(); // email -> Set<res>

function sseHeaders() {
  return {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  };
}
function sendSse(res, event, data) {
  try {
    if (event) res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(data || {})}\n\n`);
  } catch {}
}
function addClient(email, res) {
  if (!clientsByEmail.has(email)) clientsByEmail.set(email, new Set());
  clientsByEmail.get(email).add(res);
}
function removeClient(email, res) {
  const set = clientsByEmail.get(email);
  if (set) {
    set.delete(res);
    if (set.size === 0) clientsByEmail.delete(email);
  }
}
function broadcastToEmail(email, event, data) {
  const set = clientsByEmail.get(email);
  if (!set || set.size === 0) return;
  for (const res of set) sendSse(res, event, data);
}

// GET /api/submissions/stream?email=...
router.get("/stream", (req, res) => {
  const email = String(req.query.email || "").trim();
  if (!email) return res.status(400).json({ success:false, message:"email required" });

  res.writeHead(200, sseHeaders());
  sendSse(res, "ping", { t: Date.now() });

  addClient(email, res);
  const keepAlive = setInterval(() => sendSse(res, "ping", { t: Date.now() }), 25000);
  req.on("close", () => { clearInterval(keepAlive); removeClient(email, res); });
});

/* ----------------------- Helpers for plan → seconds ---------------------- */

function secondsFromPlanLabel(label = "") {
  const plan = String(label || "").toLowerCase();
  if (plan.includes("year"))  return 60 * 60 * 24 * 365;
  if (plan.includes("month")) return 60 * 60 * 24 * 30;
  if (plan.includes("week"))  return 60 * 60 * 24 * 7;
  if (plan.includes("day"))   return 60 * 60 * 24;
  return 60 * 60 * 24; // default 1 day
}

/* --------------------------------- ROUTES -------------------------------- */

// PUBLIC: submit (honors server-side Auto-Approval)
router.post("/", upload.single("screenshot"), async (req, res) => {
  const items = readAll();
  const {
    name = "",
    number = "", phone = "",
    gmail = "", email = "",
    subject = "",
    planKey = "", planLabel = "", planPrice = "",
  } = req.body || {};

  const now = Date.now();

  const item = {
    id: String(now),
    name: String(name).trim(),
    phone: String(phone || number || "").trim(),
    email: String(email || gmail || "").trim(),
    subject: String(subject).trim(),
    plan: { 
      key: String(planKey || "").trim(), 
      label: String(planLabel || "").trim(), 
      price: planPrice !== "" ? Number(planPrice) : undefined 
    },
    context: {
      type: req.body.type || "",
      id: req.body.id || "",
      playlist: req.body.playlist || "",
      subject: req.body.subjectLabel || subject || "",
    },
    proofUrl: req.file ? `/uploads/submissions/${req.file.filename}` : "",
    status: "pending",
    approved: false,
    expiry: null,
    message: "",
    createdAt: now,
  };

  const autoApprove = getAutoMode(); // admin-controlled
  if (autoApprove) {
    const secs = secondsFromPlanLabel(item.plan?.label);
    item.status   = "approved";
    item.approved = true;
    item.expiry   = now + secs * 1000;

    const feature   = item.context.type || "playlist";
    const featureId = item.context.id || item.context.playlist || item.context.subject;

    // persist to Access DB so /api/access/status reflects it
    if (item.email && featureId) {
      await Access.findOneAndUpdate(
        { email: item.email, feature, featureId },
        { expiry: new Date(item.expiry), message: item.message },
        { upsert: true, new: true }
      );

      // push to the user's browser immediately
      broadcastToEmail(item.email, "grant", {
        type: "grant",
        feature,
        featureId,
        email: item.email,
        expiry: item.expiry,
        message: item.message || `🎉 Congratulations ${item.name || "User"}! Your plan is now active.`,
      });
    }
  }

  items.unshift(item);
  writeAll(items);

  res.json({ success: true, id: item.id, expiry: item.expiry });
});

// ADMIN: list
router.get("/", isAdmin, (_req, res) => {
  const items = readAll().sort((a,b)=>b.createdAt-a.createdAt);
  res.json({ success: true, items });
});

// ADMIN: auto-mode (get/set)
router.get("/auto-mode", isAdmin, (_req, res) => {
  res.json({ success: true, auto: getAutoMode() });
});
router.post("/auto-mode", isAdmin, (req, res) => {
  setAutoMode(!!req.body.auto);
  res.json({ success: true, auto: getAutoMode() });
});

// ADMIN: approve (manual)
router.post("/:id/approve", isAdmin, async (req, res) => {
  const seconds = Number(req.body.seconds || 0);
  const message = req.body.message || "";
  if (!seconds) return res.status(400).json({ success:false, message:"seconds required" });

  const items = readAll();
  const i = items.findIndex(x => x.id === req.params.id || x._id === req.params.id);
  if (i === -1) return res.status(404).json({ success:false, message:"Not found" });

  const now = Date.now();
  items[i].status = "approved";
  items[i].approved = true;
  items[i].expiry = now + seconds * 1000;
  items[i].message = message;
  writeAll(items);

  const feature   = items[i].context?.type || "playlist";
  const featureId = items[i].context?.id || items[i].context?.playlist || items[i].context?.subject;
  const email     = items[i].email;

  if (email && featureId) {
    // persist to Access DB
    await Access.findOneAndUpdate(
      { email, feature, featureId },
      { expiry: new Date(items[i].expiry), message: items[i].message },
      { upsert: true, new: true }
    );

    // broadcast to user
    broadcastToEmail(email, "grant", {
      type: "grant",
      feature,
      featureId,
      email,
      expiry: items[i].expiry,
      message: items[i].message || `🎉 Congratulations ${items[i].name || "User"}! Your plan is now active.`,
    });
  }

  res.json({ success: true, item: items[i] });
});

// ADMIN: revoke
router.post("/:id/revoke", isAdmin, async (req, res) => {
  const items = readAll();
  const i = items.findIndex(x => x.id === req.params.id || x._id === req.params.id);
  if (i === -1) return res.status(404).json({ success:false, message:"Not found" });

  items[i].status = "revoked";
  items[i].approved = false;
  items[i].expiry = null;
  items[i].message = "";
  writeAll(items);

  const feature   = items[i].context?.type || "playlist";
  const featureId = items[i].context?.id || items[i].context?.playlist || items[i].context?.subject;
  const email     = items[i].email;

  if (email && featureId) {
    // remove from Access DB
    await Access.deleteOne({ email, feature, featureId });

    // notify user immediately
    broadcastToEmail(email, "revoke", {
      type: "revoke",
      feature,
      featureId,
      email,
    });
  }

  res.json({ success: true, item: items[i] });
});

// ADMIN: reject/remove (soft delete)
router.post("/:id/reject", isAdmin, async (req, res) => {
  const items = readAll();
  const i = items.findIndex(x => x.id === req.params.id || x._id === req.params.id);
  if (i === -1) return res.status(404).json({ success:false, message:"Not found" });
  const [removed] = items.splice(i, 1);
  writeAll(items);

  if (removed.proofUrl?.startsWith("/uploads/submissions/")) {
    const abs = path.join(__dirname, "..", removed.proofUrl.replace(/^\//,""));
    const safeRoot = path.join(__dirname, "..", "uploads", "submissions");
    if (abs.startsWith(safeRoot)) {
      await fs.promises.unlink(abs).catch(() => {});
    }
  }

  res.json({ success: true, removed });
});

// Optional hard delete
router.delete("/:id", isAdmin, async (req, res) => {
  const items = readAll();
  const i = items.findIndex(x => x.id === req.params.id || x._id === req.params.id);
  if (i === -1) return res.status(404).json({ success:false, message:"Not found" });
  const [removed] = items.splice(i, 1);
  writeAll(items);

  if (removed.proofUrl?.startsWith("/uploads/submissions/")) {
    const abs = path.join(__dirname, "..", removed.proofUrl.replace(/^\//,""));
    const safeRoot = path.join(__dirname, "..", "uploads", "submissions");
    if (abs.startsWith(safeRoot)) {
      await fs.promises.unlink(abs).catch(() => {});
    }
  }

  res.json({ success: true, removed });
});

// PUBLIC: check my submission (polling fallback)
router.get("/my", (req, res) => {
  const { email = "", type = "", id = "" } = req.query;
  if (!email) return res.status(400).json({ success: false, message: "email required" });

  const items = readAll();
  const match = items.find(x =>
    x.email === email &&
    (!type || x.context.type === type) &&
    (!id || x.context.id === id)
  );

  if (!match) return res.json({ success: true, found: false });
  res.json({ success: true, found: true, item: match });
});

module.exports = router;
