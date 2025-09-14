// routes/users.js

/**
 * Users / Auth Routes
 *  - POST   /api/users/set-owner     -> initialize OWNER_KEY (first-time setup only)
 *  - POST   /api/users/login         -> authenticate with OWNER_KEY
 *  - GET    /api/users/me            -> verify current session / owner status
 *  - POST   /api/users/logout        -> clear session
 *
 * Notes:
 *  - Relies on process.env.OWNER_KEY
 *  - For simplicity, this uses a memory/session guard (no DB for users)
 *  - You should set OWNER_KEY in .env
 */

const express = require("express");

const router = express.Router();

// Middleware to check if already authenticated
function ensureOwner(req, res, next) {
  if (req.isOwner) return next();
  return res.status(401).json({ ok: false, error: "Unauthorized" });
}

// --------------------- POST /set-owner ---------------------
// One-time setup — sets OWNER_KEY in env (if missing)
router.post("/set-owner", (req, res) => {
  const { ownerKey } = req.body || {};

  if (!ownerKey || !ownerKey.trim()) {
    return res.status(400).json({ ok: false, error: "ownerKey is required" });
  }

  if (process.env.OWNER_KEY && process.env.OWNER_KEY.trim() !== "") {
    return res.status(400).json({ ok: false, error: "Owner already set" });
  }

  // ⚠️ NOTE: This won't persist unless you update your .env manually
  process.env.OWNER_KEY = ownerKey.trim();

  return res.status(201).json({ ok: true, message: "Owner key set successfully" });
});

// --------------------- POST /login ---------------------
router.post("/login", (req, res) => {
  const { ownerKey } = req.body || {};
  const storedKey = String(process.env.OWNER_KEY || "");

  if (!ownerKey || ownerKey !== storedKey) {
    return res.status(401).json({ ok: false, error: "Invalid ownerKey" });
  }

  // Simple session flag
  req.session = req.session || {};
  req.session.isOwner = true;

  return res.json({ ok: true, message: "Login successful" });
});

// --------------------- GET /me ---------------------
router.get("/me", (req, res) => {
  if (req.session?.isOwner) {
    return res.json({ ok: true, data: { isOwner: true } });
  }
  return res.status(401).json({ ok: false, error: "Not authenticated" });
});

// --------------------- POST /logout ---------------------
router.post("/logout", ensureOwner, (req, res) => {
  if (req.session) {
    req.session.isOwner = false;
  }
  return res.json({ ok: true, message: "Logged out" });
});

module.exports = router;

