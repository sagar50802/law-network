// server/routes/utils.js
import fs from "fs";
import path from "path";

/** Ensure a directory exists */
function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

/** Admin guard (middleware) */
function isAdmin(req, res, next) {
  const ADMIN_KEY = process.env.ADMIN_KEY || "LAWNOWNER2025";
  const auth = req.headers["authorization"] || "";
  const bearer = auth.replace(/^Bearer\s+/i, "");
  const xok =
    req.headers["x-owner-key"] ||
    req.headers["x-ownerkey"] ||
    req.headers["X-Owner-Key"];
  const token = bearer || xok;

  if (String(token) === String(ADMIN_KEY)) return next();
  return res.status(401).json({ success: false, message: "Unauthorized" });
}

export { ensureDir, isAdmin };
