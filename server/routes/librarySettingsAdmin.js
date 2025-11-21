import express from "express";
import LibrarySettings from "../models/LibrarySettings.js";

const router = express.Router();

/* ============================================================
   🔐 ADMIN MIDDLEWARE (HEADER-BASED)
   Works with client header: x-owner-key
============================================================ */
const requireAdmin = (req, res, next) => {
  const headerKey =
    req.headers["x-owner-key"] || req.headers["x-admin-token"];

  const serverKey =
    process.env.VITE_OWNER_KEY ||
    process.env.ADMIN_PANEL_KEY ||
    process.env.ADMIN_SHARED_SECRET;

  if (headerKey && serverKey && headerKey === serverKey) {
    req.user = req.user || {};
    req.user.isAdmin = true;
    return next();
  }

  return res.status(403).json({ success: false, message: "Admin only" });
};

/* ============================================================
   ⭐ Ensure ONLY ONE settings document exists
============================================================ */
async function ensureSettings() {
  let settings = await LibrarySettings.findOne();
  if (!settings) settings = await LibrarySettings.create({});
  return settings;
}

/* ============================================================
   📌 GET SETTINGS
   GET /api/admin/library/settings
============================================================ */
router.get("/settings", requireAdmin, async (_req, res) => {
  try {
    const settings = await ensureSettings();
    return res.json({ success: true, data: settings });
  } catch (err) {
    console.error("[Settings] GET error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to load settings" });
  }
});

/* ============================================================
   🛠 UPDATE SETTINGS
   PATCH /api/admin/library/settings
============================================================ */
router.patch("/settings", requireAdmin, async (req, res) => {
  try {
    const settings = await ensureSettings();

    Object.assign(settings, req.body || {});
    await settings.save();

    return res.json({ success: true, data: settings });
  } catch (err) {
    console.error("[Settings] PATCH error:", err);
    return res
      .status(500)
      .json({ success: false, message: "Failed to update settings" });
  }
});

export default router;
