// server/routes/utils.js
const fs = require("fs");
const path = require("path");

// ensure directory exists
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

// safe JSON helpers
function readJSON(file, fallback = []) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}
function writeJSON(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// consistent admin guard
function isAdmin(req, res, next) {
  const adminKey = process.env.ADMIN_KEY || "LAWNOWNER2025";

  // support both "Authorization: Bearer ..." and x-owner-key header
  const hdr = req.headers["authorization"] || "";
  const xok = req.headers["x-owner-key"] || req.headers["x-ownerkey"] || "";
  const token = hdr.replace(/^Bearer\s+/i, "") || String(xok);

  if (token === adminKey) return next();
  return res.status(401).json({ success: false, message: "Unauthorized" });
}

module.exports = { ensureDir, readJSON, writeJSON, isAdmin };
