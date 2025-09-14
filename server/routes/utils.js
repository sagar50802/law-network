// server/routes/utils.js
const fs = require("fs");
const path = require("path");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}
function writeJSON(file, data) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}
function isAdmin(req, res, next) {
  const hdr = req.headers["authorization"] || "";
  const xok = req.headers["x-owner-key"] || req.headers["x-ownerkey"] || "";
  const token = hdr.replace(/^Bearer\s+/i, "") || String(xok);
  if (token === req.ADMIN_KEY) return next();
  return res.status(401).json({ success: false, message: "Unauthorized" });
}

module.exports = { ensureDir, readJSON, writeJSON, isAdmin };
