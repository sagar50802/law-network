// routes/librarySettingsAdmin.js
import express from "express";
import LibrarySettings from "../models/LibrarySettings.js";

const router = express.Router();

/* ============================================================
   🔐 UNIFIED ADMIN CHECK
============================================================ */
const requireAdmin = (req, res, next) => {
  if (req.user && req.user.isAdmin) return next();

  const headerToken =
    req.headers["x-admin-token"] || req.headers["x-owner-key"];

  const shared =
    process.env.ADMIN_PANEL_KEY ||
    process.env.ADMIN_SHARED_SECRET ||
    process.env.ADMIN_SECRET ||
    process.env.OWNER_KEY;

  if (shared && headerToken && headerToken === shared) {
    if (!req.user) req.user = {};
    req.user.isAdmin = true;
    return next();
  }

  return res.status(403).json({ success: false, message: "Admin only" });
};

/* ------------------------------------------------------------
   Ensure settings exists
------------------------------------------------------------ */
async function ensureSettings() {
  let s = await LibrarySettings.findOne();
  if (!s) s = await LibrarySettings.create({});
  return s;
}

/* ============================================================
   🔹 GET /api/admin/library/settings
============================================================ */
router.get("/settings", requireAdmin, async (_req, res) => {
  try {
    const settings = await ensureSettings();
    res.json({ success: true, data: settings });
  } catch (err) {
    console.error("GET settings error:", err);
    res.status(500).json({ success: false, message: "Failed to load settings" });
  }
});

/* ============================================================
   🔹 PATCH /api/admin/library/settings
============================================================ */
router.patch("/settings", requireAdmin, async (req, res) => {
  try {
    const settings = await ensureSettings();

    Object.assign(settings, req.body || {});
    await settings.save();

    res.json({ success: true, data: settings });
  } catch (err) {
    console.error("PATCH settings error:", err);
    res.status(500).json({ success: false, message: "Failed to update settings" });
  }
});

export default router;
