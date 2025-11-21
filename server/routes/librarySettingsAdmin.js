import express from "express";
import LibrarySettings from "../models/LibrarySettings.js";

const router = express.Router();

/* ============================================================
   🔐 ADMIN MIDDLEWARE
   Accepts:
   - req.user.isAdmin
   - OR x-admin-token / x-owner-key header
============================================================ */
const requireAdmin = (req, res, next) => {
  // cookie/session admin
  if (req.user && req.user.isAdmin) return next();

  // header admin token
  const token =
    req.headers["x-admin-token"] || req.headers["x-owner-key"];

  const expected =
    process.env.ADMIN_PANEL_KEY ||
    process.env.ADMIN_SHARED_SECRET ||
    process.env.OWNER_KEY ||
    "";

  if (expected && token && token === expected) {
    if (!req.user) req.user = {};
    req.user.isAdmin = true;
    req.user.adminVia = "header";
    return next();
  }

  return res.status(403).json({ success: false, message: "Admin only" });
};

/* ============================================================
   Ensure settings object exists
============================================================ */
async function ensureSettings() {
  let s = await LibrarySettings.findOne();
  if (!s) s = await LibrarySettings.create({});
  return s;
}

/* ============================================================
   GET SETTINGS
   GET /api/admin/library/settings
============================================================ */
router.get("/settings", requireAdmin, async (_req, res) => {
  try {
    const settings = await ensureSettings();
    res.json({ success: true, data: settings });
  } catch (err) {
    console.error("GET settings error:", err);
    res.json({ success: false, message: "Failed to load settings" });
  }
});

/* ============================================================
   UPDATE SETTINGS
   PATCH /api/admin/library/settings
============================================================ */
router.patch("/settings", requireAdmin, async (req, res) => {
  try {
    const settings = await ensureSettings();

    const fields = [
      "seatBasePrice",
      "seatDurationsMinutes",
      "defaultReadingHours",
      "autoApproveSeat",
      "autoApproveBook",
    ];

    fields.forEach((f) => {
      if (req.body[f] !== undefined) settings[f] = req.body[f];
    });

    await settings.save();

    res.json({ success: true, data: settings });
  } catch (err) {
    console.error("PATCH settings error:", err);
    res.json({ success: false, message: "Failed to update settings" });
  }
});

export default router;
