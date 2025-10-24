// server/prep_access.js
const fs = require("fs");
const path = require("path");
const express = require("express");
const router = express.Router();

// Ensure body parsing (for JSON + urlencoded). If defined globally, you can remove these two lines.
router.use(express.json());
router.use(express.urlencoded({ extended: true }));

/* ------------------------- tiny JSON “DB” ------------------------- */
const DATA_DIR = path.join(process.cwd(), "data");
const DB_FILE = path.join(DATA_DIR, "prep_access.json");

function ensureDirs() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(DB_FILE)) {
    const init = {
      configs: {}, // examId -> { name, planDays, autoGrant, payment{upiId, upiName, priceINR, whatsappNumber, whatsappText}}
      // simplified access table: examId+email -> { status: 'active'|'revoked', updatedAt }
      access: {},
      // requests list (for admin UI)
      requests: [], // { id, examId, email, name, phone, intent, note, status('pending'|'approved'|'rejected'), createdAt }
      seq: 1,
    };
    fs.writeFileSync(DB_FILE, JSON.stringify(init, null, 2));
  }
}
function loadDB() {
  ensureDirs();
  return JSON.parse(fs.readFileSync(DB_FILE, "utf8"));
}
function saveDB(db) {
  ensureDirs();
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}
function idgen(db) {
  const id = String(db.seq++);
  return id;
}
function key(examId, email) {
  return `${String(examId || "").trim()}|${String(email || "").trim().toLowerCase()}`;
}

/* -------------------------- helpers -------------------------- */

function getAccess(db, examId, email) {
  const k = key(examId, email);
  return db.access[k] || { status: "inactive" };
}
function setAccess(db, examId, email, status) {
  const k = key(examId, email);
  db.access[k] = { status, updatedAt: new Date().toISOString() };
}
function latestRequestFor(db, examId, email) {
  const arr = db.requests
    .filter((r) => r.examId === examId && r.email.toLowerCase() === String(email || "").toLowerCase())
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return arr[0];
}

/* -------------------------- GUARD -------------------------- */
/**
 * GET /api/prep/access/status/guard?examId&email
 * Returns:
 *   { exam, access: { status: 'active'|'inactive' }, overlay: { mode, payment } }
 *  - This is what the client uses to decide whether to show or hide the overlay.
 */
router.get("/api/prep/access/status/guard", (req, res) => {
  const { examId = "", email = "" } = req.query || {};
  const db = loadDB();
  const cfg = db.configs[examId] || { name: examId, planDays: 1, autoGrant: false, payment: {} };
  const acc = getAccess(db, examId, email);

  const access = { status: acc.status === "active" ? "active" : "inactive" };
  const overlay = { mode: "purchase", payment: cfg.payment || {} };

  const exam = { id: examId, name: cfg.name || String(examId).toUpperCase(), price: cfg.payment?.priceINR || 0, overlay: { payment: cfg.payment || {} } };

  return res.json({ exam, access, overlay });
});

/* ------------------------- USER: Create request ------------------------- */
/**
 * POST /api/prep/access/request
 * body: FormData or urlencoded:
 *   examId, email, name?, phone?, intent('purchase'|'restart'), note?
 * Response:
 *   { success: true, approved?: true } | { code: 'ALREADY_ACTIVE' }
 */
router.post("/api/prep/access/request", (req, res) => {
  const { examId = "", email = "", name = "", phone = "", intent = "purchase", note = "" } = req.body || {};
  const db = loadDB();

  // Already active?
  const acc = getAccess(db, examId, email);
  if (acc.status === "active") {
    return res.json({ success: true, code: "ALREADY_ACTIVE" });
  }

  // create a request
  const r = {
    id: idgen(db),
    examId,
    email: String(email || "").toLowerCase(),
    name,
    phone,
    intent,
    note,
    status: "pending",
    createdAt: new Date().toISOString(),
  };
  db.requests.push(r);

  const cfg = db.configs[examId] || {};
  if (cfg.autoGrant) {
    // auto-approve
    r.status = "approved";
    setAccess(db, examId, email, "active");
    saveDB(db);
    return res.json({ success: true, approved: true });
  }

  saveDB(db);
  return res.json({ success: true, approved: false });
});

/* ------------------------- USER: Poll request status ------------------------- */
/**
 * GET /api/prep/access/request/status?examId&email
 * → { status: 'pending'|'approved'|'rejected' } or {}
 */
router.get("/api/prep/access/request/status", (req, res) => {
  const { examId = "", email = "" } = req.query || {};
  const db = loadDB();
  const r = latestRequestFor(db, examId, email);
  if (!r) return res.json({});
  return res.json({ status: r.status });
});

/* ------------------------- ADMIN: Config ------------------------- */
router.get("/api/prep/access/admin/config", (req, res) => {
  const { examId = "" } = req.query || {};
  const db = loadDB();
  const cfg = db.configs[examId] || { name: examId, planDays: 21, autoGrant: false, payment: {} };
  res.json({ success: true, config: cfg });
});

router.post("/api/prep/access/admin/config", (req, res) => {
  const { examId, name, planDays, autoGrant, payment } = req.body || {};
  if (!examId) return res.status(400).json({ success: false, error: "examId required" });
  const db = loadDB();
  db.configs[examId] = {
    ...(db.configs[examId] || {}),
    name: name ?? (db.configs[examId]?.name || examId),
    planDays: Number(planDays ?? db.configs[examId]?.planDays ?? 21),
    autoGrant: !!(autoGrant ?? db.configs[examId]?.autoGrant ?? false),
    payment: { ...(db.configs[examId]?.payment || {}), ...(payment || {}) },
  };
  saveDB(db);
  res.json({ success: true });
});

/* ------------------------- ADMIN: Requests list ------------------------- */
router.get("/api/prep/access/admin/requests", (req, res) => {
  const { examId = "" } = req.query || {};
  const db = loadDB();
  const items = db.requests
    .filter((r) => r.examId === examId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ success: true, items });
});

/* ------------------------- ADMIN: approve/reject/revoke ------------------------- */
/**
 * POST /api/prep/access/admin/approve
 * body: { examId, email, mode: 'grant'|'reject'|'revoke' }
 */
router.post("/api/prep/access/admin/approve", (req, res) => {
  const { examId = "", email = "", mode = "" } = req.body || {};
  const db = loadDB();

  const r = latestRequestFor(db, examId, email);

  if (mode === "grant") {
    if (r) r.status = "approved";
    setAccess(db, examId, email, "active");
    saveDB(db);
    return res.json({ success: true });
  }

  if (mode === "reject") {
    if (r) r.status = "rejected";
    setAccess(db, examId, email, "inactive");
    saveDB(db);
    return res.json({ success: true });
  }

  if (mode === "revoke") {
    setAccess(db, examId, email, "revoked");
    saveDB(db);
    return res.json({ success: true });
  }

  return res.status(400).json({ success: false, error: "mode must be grant|reject|revoke" });
});

/* ------------------------- ADMIN: delete / batch delete requests ------------------------- */
/**
 * POST /api/prep/access/admin/delete
 * body: { ids: string[] }
 */
router.post("/api/prep/access/admin/delete", (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || !ids.length) {
    return res.status(400).json({ success: false, error: "ids[] required" });
  }
  const db = loadDB();
  const before = db.requests.length;
  const idset = new Set(ids.map(String));
  db.requests = db.requests.filter((r) => !idset.has(String(r.id)));
  const removed = before - db.requests.length;
  saveDB(db);
  res.json({ success: true, removed });
});

module.exports = router;
