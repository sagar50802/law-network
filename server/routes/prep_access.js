import express, { Router } from "express";
import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

// ----------------------------------------------------------------------------
// Paths & simple JSON "DB"
// ----------------------------------------------------------------------------
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "..", "data");
const DB_FILE = path.join(DATA_DIR, "prep_access.json");

// Very small write lock to serialize writes to the JSON file
let _writeLock = Promise.resolve();

async function withWriteLock(fn) {
  const prev = _writeLock;
  let release;
  _writeLock = new Promise((res) => (release = res));
  try {
    await prev;
    const out = await fn();
    release();
    return out;
  } catch (e) {
    release();
    throw e;
  }
}

async function ensureDbFile() {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true });
  } catch {}
  try {
    await fs.access(DB_FILE);
  } catch {
    const initial = {
      // Global overlay/payment config shown to users
      config: {
        autoGrant: false, // if true, requests are auto-approved
        priceINR: 0,
        upiId: "",
        upiName: "",
        whatsappNumber: "",
        whatsappText: "",
      },
      // Array of request records
      requests: [],
      // Grants: active/revoked per (examId, email)
      grants: [], // { examId, email, status: "active"|"revoked", grantedAt, revokedAt? }
    };
    await fs.writeFile(DB_FILE, JSON.stringify(initial, null, 2));
  }
}

async function loadDB() {
  await ensureDbFile();
  const raw = await fs.readFile(DB_FILE, "utf8");
  try {
    const j = JSON.parse(raw);
    // Backfill keys if older file
    if (!j.config) j.config = { autoGrant: false };
    if (!Array.isArray(j.requests)) j.requests = [];
    if (!Array.isArray(j.grants)) j.grants = [];
    return j;
  } catch {
    const reset = { config: { autoGrant: false }, requests: [], grants: [] };
    await fs.writeFile(DB_FILE, JSON.stringify(reset, null, 2));
    return reset;
  }
}

async function saveDB(db) {
  await withWriteLock(async () => {
    await fs.writeFile(DB_FILE, JSON.stringify(db, null, 2));
  });
}

// ----------------------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------------------
const router = Router();

/* ✅ Ensure JSON body parsing for all endpoints */
router.use(express.json());

function nowISO() {
  return new Date().toISOString();
}

function rid() {
  return crypto.randomBytes(12).toString("hex");
}

function normEmail(s) {
  return String(s || "").trim().toLowerCase();
}

function normExamId(s) {
  return String(s || "").trim();
}

function findActiveGrant(db, examId, email) {
  examId = normExamId(examId);
  email = normEmail(email);
  return db.grants.find(
    (g) => g.examId === examId && normEmail(g.email) === email && g.status === "active"
  );
}

function upsertGrant(db, examId, email, status) {
  examId = normExamId(examId);
  email = normEmail(email);
  let g = db.grants.find((x) => x.examId === examId && normEmail(x.email) === email);
  if (!g) {
    g = { examId, email, status: "active", grantedAt: nowISO() };
    db.grants.push(g);
  }
  if (status === "active") {
    g.status = "active";
    g.grantedAt = nowISO();
    delete g.revokedAt;
  } else if (status === "revoked") {
    g.status = "revoked";
    g.revokedAt = nowISO();
  }
  return g;
}

function latestRequest(db, examId, email) {
  examId = normExamId(examId);
  email = normEmail(email);
  const list = db.requests
    .filter((r) => r.examId === examId && normEmail(r.email) === email)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return list[0] || null;
}

function overlayPayment(db) {
  const c = db.config || {};
  return {
    priceINR: Number(c.priceINR || 0),
    upiId: String(c.upiId || ""),
    upiName: String(c.upiName || ""),
    whatsappNumber: String(c.whatsappNumber || ""),
    whatsappText: String(c.whatsappText || ""),
  };
}

function adminExamName(examId) {
  const s = String(examId || "").trim();
  if (!s) return "COURSE";
  return s.toUpperCase();
}

// ----------------------------------------------------------------------------
// PUBLIC: Access status guard
// ----------------------------------------------------------------------------
router.get("/api/prep/access/status/guard", async (req, res) => {
  try {
    const examId = normExamId(req.query.examId);
    const email = normEmail(req.query.email);

    if (!examId) {
      return res.status(400).json({ success: false, error: "Missing examId" });
    }

    const db = await loadDB();
    const active = email ? findActiveGrant(db, examId, email) : null;
    const lastReq = email ? latestRequest(db, examId, email) : null;

    const access = { status: active ? "active" : "inactive" };
    const exam = {
      id: examId,
      name: adminExamName(examId),
      overlay: { payment: overlayPayment(db) },
    };

    let overlay = { mode: "purchase" };
    if (!active && lastReq && lastReq.status === "pending") overlay.mode = "waiting";

    return res.json({ success: true, exam, access, overlay });
  } catch (e) {
    console.error("[status/guard] error:", e);
    return res.status(500).json({ success: false, error: "Internal error" });
  }
});

// ----------------------------------------------------------------------------
// PUBLIC: Create access request (purchase or restart)
// ----------------------------------------------------------------------------
router.post("/api/prep/access/request", async (req, res) => {
  console.log("[prep_access] incoming request body:", req.body);
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

    const db = await loadDB();
    const cfg = db.config || {};

    // If already active, signal to client to unlock immediately
    if (findActiveGrant(db, ex, em)) {
      return res.json({ success: true, code: "ALREADY_ACTIVE" });
    }

    const reqId = rid();
    const rec = {
      id: reqId,
      examId: ex,
      email: em,
      intent: intent === "restart" ? "restart" : "purchase",
      name,
      phone,
      note,
      status: "pending",
      createdAt: nowISO(),
      updatedAt: nowISO(),
    };
    db.requests.push(rec);

    // Auto-approve?
    let approved = false;
    if (cfg.autoGrant) {
      rec.status = "approved";
      rec.updatedAt = nowISO();
      upsertGrant(db, ex, em, "active");
      approved = true;
    }

    await saveDB(db);
    return res.json({ success: true, id: reqId, approved });
  } catch (e) {
    console.error("[access/request] error:", e);
    return res.status(500).json({
      success: false,
      error: e.message || "Internal error",
      stack: process.env.NODE_ENV !== "production" ? e.stack : undefined,
    });
  }
});

// ----------------------------------------------------------------------------
// PUBLIC: Poll request status
// ----------------------------------------------------------------------------
router.get("/api/prep/access/request/status", async (req, res) => {
  try {
    const examId = normExamId(req.query.examId);
    const email = normEmail(req.query.email);
    if (!examId || !email) {
      return res.status(400).json({ success: false, error: "Missing examId or email" });
    }

    const db = await loadDB();
    const last = latestRequest(db, examId, email);
    if (!last) return res.json({ success: true, status: null });

    return res.json({ success: true, status: last.status, id: last.id });
  } catch (e) {
    console.error("[request/status] error:", e);
    return res.status(500).json({ success: false, error: "Internal error" });
  }
});

// ----------------------------------------------------------------------------
// ADMIN: Get & Save overlay/payment config
// ----------------------------------------------------------------------------
router.get("/api/admin/prep/access/config", async (_req, res) => {
  try {
    const db = await loadDB();
    return res.json({ success: true, config: db.config || {} });
  } catch (e) {
    console.error("[admin/config:get] error:", e);
    return res.status(500).json({ success: false, error: "Internal error" });
  }
});

router.post("/api/admin/prep/access/config", async (req, res) => {
  try {
    const db = await loadDB();
    const b = req.body || {};

    db.config = {
      autoGrant: Boolean(b.autoGrant),
      priceINR: Number(b.priceINR || 0),
      upiId: String(b.upiId || ""),
      upiName: String(b.upiName || ""),
      whatsappNumber: String(b.whatsappNumber || ""),
      whatsappText: String(b.whatsappText || ""),
    };

    await saveDB(db);
    return res.json({ success: true, config: db.config });
  } catch (e) {
    console.error("[admin/config:post] error:", e);
    return res.status(500).json({ success: false, error: "Internal error" });
  }
});

// ----------------------------------------------------------------------------
// ADMIN: List requests
// ----------------------------------------------------------------------------
router.get("/api/admin/prep/access/requests", async (req, res) => {
  try {
    const examId = normExamId(req.query.examId);
    const status = String(req.query.status || "").trim();
    const limit = Math.max(1, Math.min(500, Number(req.query.limit || 50)));

    const db = await loadDB();
    let list = db.requests.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    if (examId) list = list.filter((r) => r.examId === examId);
    if (status) list = list.filter((r) => r.status === status);

    return res.json({ success: true, items: list.slice(0, limit) });
  } catch (e) {
    console.error("[admin/requests:list] error:", e);
    return res.status(500).json({ success: false, error: "Internal error" });
  }
});

// ----------------------------------------------------------------------------
// ADMIN: Approve / Reject / Revoke
// ----------------------------------------------------------------------------
router.post("/api/admin/prep/access/approve", async (req, res) => {
  try {
    const { id } = req.body || {};
    let { examId, email } = req.body || {};
    const db = await loadDB();

    let rec = null;
    if (id) {
      rec = db.requests.find((r) => r.id === id);
    } else if (examId && email) {
      examId = normExamId(examId);
      email = normEmail(email);
      rec = db.requests
        .filter((r) => r.examId === examId && normEmail(r.email) === email)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    }

    if (!rec) return res.status(404).json({ success: false, error: "Request not found" });

    rec.status = "approved";
    rec.updatedAt = nowISO();
    upsertGrant(db, rec.examId, rec.email, "active");

    await saveDB(db);
    return res.json({ success: true, request: rec });
  } catch (e) {
    console.error("[admin/approve] error:", e);
    return res.status(500).json({ success: false, error: "Internal error" });
  }
});

router.post("/api/admin/prep/access/reject", async (req, res) => {
  try {
    const { id } = req.body || {};
    let { examId, email } = req.body || {};
    const db = await loadDB();

    let rec = null;
    if (id) {
      rec = db.requests.find((r) => r.id === id);
    } else if (examId && email) {
      examId = normExamId(examId);
      email = normEmail(email);
      rec = db.requests
        .filter((r) => r.examId === examId && normEmail(r.email) === email)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
    }

    if (!rec) return res.status(404).json({ success: false, error: "Request not found" });

    rec.status = "rejected";
    rec.updatedAt = nowISO();

    await saveDB(db);
    return res.json({ success: true, request: rec });
  } catch (e) {
    console.error("[admin/reject] error:", e);
    return res.status(500).json({ success: false, error: "Internal error" });
  }
});

router.post("/api/admin/prep/access/revoke", async (req, res) => {
  try {
    const examId = normExamId(req.body?.examId);
    const email = normEmail(req.body?.email);
    if (!examId || !email) {
      return res.status(400).json({ success: false, error: "Missing examId or email" });
    }

    const db = await loadDB();
    const g = upsertGrant(db, examId, email, "revoked");
    await saveDB(db);
    return res.json({ success: true, grant: g });
  } catch (e) {
    console.error("[admin/revoke] error:", e);
    return res.status(500).json({ success: false, error: "Internal error" });
  }
});

// ----------------------------------------------------------------------------
// ADMIN: Delete single or batch
// ----------------------------------------------------------------------------
router.post("/api/admin/prep/access/delete", async (req, res) => {
  try {
    const { id } = req.body || {};
    if (!id) return res.status(400).json({ success: false, error: "Missing id" });

    const db = await loadDB();
    const before = db.requests.length;
    db.requests = db.requests.filter((r) => r.id !== id);
    const removed = before - db.requests.length;

    await saveDB(db);
    return res.json({ success: true, removed });
  } catch (e) {
    console.error("[admin/delete] error:", e);
    return res.status(500).json({ success: false, error: "Internal error" });
  }
});

router.post("/api/admin/prep/access/batch-delete", async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const examId = normExamId(req.body?.examId);
    const emails = Array.isArray(req.body?.emails)
      ? req.body.emails.map(normEmail).filter(Boolean)
      : [];

    const db = await loadDB();
    const before = db.requests.length;

    db.requests = db.requests.filter((r) => {
      if (ids.length && ids.includes(r.id)) return false;
      if (examId && emails.length) {
        return !(r.examId === examId && emails.includes(normEmail(r.email)));
      }
      if (examId && !emails.length) {
        return true;
      }
      return true;
    });

    const removed = before - db.requests.length;
    await saveDB(db);
    return res.json({ success: true, removed });
  } catch (e) {
    console.error("[admin/batch-delete] error:", e);
    return res.status(500).json({ success: false, error: "Internal error" });
  }
});

// ----------------------------------------------------------------------------
// Default export
// ----------------------------------------------------------------------------
export default router;
