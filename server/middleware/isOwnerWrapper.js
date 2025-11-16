// server/middlewares/isOwnerWrapper.js
import { createRequire } from "module";
const require = createRequire(import.meta.url);

// Load your existing CommonJS middleware WITHOUT changing it
let base;
try { base = require("./isOwner.js"); } catch { /* ignore */ }

const original = typeof base === "function" ? base : (base?.default || null);

const keys = [
  process.env.OWNER_KEY,
  process.env.ADMIN_KEY,
  process.env.VITE_OWNER_KEY,
].filter(Boolean);

function matchesAny(val) {
  const s = String(val || "");
  return !!(s && keys.some(k => String(k) === s));
}

export default function isOwnerWrapper(req, res, next) {
  // 1) Trust prior auth
  if (req.isOwner === true) return next();

  // 2) Header or query fallback
  const headerKey = req.headers["x-owner-key"];
  const queryKey  = req.query?.owner || req.query?.key || req.query?.admin;

  if (matchesAny(headerKey) || matchesAny(queryKey)) {
    req.isOwner = true;
    return next();
  }

  // 3) Defer to your original middleware (if present)
  if (original) return original(req, res, next);

  // 4) Final fallback
  return res.status(403).json({ ok: false, error: "Forbidden: Admin only" });
}
