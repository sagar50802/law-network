// middlewares/isOwner.js
require("dotenv").config();

/**
 * Middleware to verify "owner" (admin) access.
 * Checks:
 *  - req.isOwner (if some upstream auth already set it)
 *  - OR header: "x-owner-key" === process.env.OWNER_KEY
 */
function isOwner(req, res, next) {
  const headerKey = String(req.headers["x-owner-key"] || "");
  const ownerKey = String(process.env.OWNER_KEY || "");

  if (req.isOwner === true) {
    return next();
  }

  if (ownerKey && headerKey === ownerKey) {
    req.isOwner = true;
    return next();
  }

  return res.status(403).json({ ok: false, error: "Forbidden: Admin only" });
}

module.exports = isOwner;
