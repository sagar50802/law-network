 // Minimal, stand-alone admin check used only by the ESM routes we added.
// Does NOT import your legacy middlewares/isOwner.js (so deploy won't break).
export default function isOwnerWrapper(req, res, next) {
  const headerKey = String(req.headers["x-owner-key"] || "");
  const ownerKey = String(process.env.OWNER_KEY || "");

  if (req.isOwner === true) return next();
  if (ownerKey && headerKey === ownerKey) {
    req.isOwner = true;
    return next();
  }
  return res.status(403).json({ ok: false, error: "Forbidden: Admin only" });
}
