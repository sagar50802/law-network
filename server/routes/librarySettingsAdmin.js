import express from "express";
import LibrarySettings from "../models/LibrarySettings.js";

const router = express.Router();

/* -------------------------------------------------------------------------- */
/* 📌 Ensure settings document exists                                         */
/* -------------------------------------------------------------------------- */
async function ensureSettings() {
  let settings = await LibrarySettings.findOne();
  if (!settings) {
    settings = await LibrarySettings.create({});
  }
  return settings;
}

/* -------------------------------------------------------------------------- */
/* 🔹 GET /api/admin/library/settings                                         */
/* -------------------------------------------------------------------------- */
router.get("/settings", async (req, res) => {
  try {
    const settings = await ensureSettings();
    res.json({ success: true, data: settings });
  } catch (err) {
    console.error("⚠️ Settings GET error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* -------------------------------------------------------------------------- */
/* 🔹 POST /api/admin/library/settings                                        */
/* -------------------------------------------------------------------------- */
router.post("/settings", async (req, res) => {
  try {
    let settings = await ensureSettings();

    const {
      seatBasePrice,
      seatDurationsMinutes,
      defaultReadingHours,
      autoApproveSeat,
      autoApproveBook,
    } = req.body;

    // Update fields ONLY if provided
    if (seatBasePrice !== undefined) settings.seatBasePrice = seatBasePrice;
    if (seatDurationsMinutes !== undefined)
      settings.seatDurationsMinutes = seatDurationsMinutes;
    if (defaultReadingHours !== undefined)
      settings.defaultReadingHours = defaultReadingHours;
    if (autoApproveSeat !== undefined) settings.autoApproveSeat = autoApproveSeat;
    if (autoApproveBook !== undefined) settings.autoApproveBook = autoApproveBook;

    await settings.save();

    res.json({ success: true, message: "Settings updated", data: settings });
  } catch (err) {
    console.error("⚠️ Settings POST error:", err);
    res.status(500).json({ success: false, message: "Failed to update settings" });
  }
});

export default router;
