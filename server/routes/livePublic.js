import express from "express";
import LiveProgramSlide from "../models/LiveProgramSlide.js";
import LiveTickerItem from "../models/LiveTickerItem.js";

const router = express.Router();

/* ============================================================
   📺 GET /api/live/slides
   - Returns ALL active slides
   - No auto-expire
============================================================ */
router.get("/slides", async (req, res) => {
  try {
    const slides = await LiveProgramSlide.find({
      isActive: true
    }).sort({ createdAt: 1 });

    res.json(slides);
  } catch (err) {
    console.error("❌ Error fetching live slides:", err);
    res.status(500).json({ error: "Server error loading slides" });
  }
});

/* ============================================================
   📰 GET /api/live/ticker
   - Returns ALL active ticker items
   - No auto-expire
============================================================ */
router.get("/ticker", async (req, res) => {
  try {
    const items = await LiveTickerItem.find({
      isActive: true
    }).sort({ createdAt: 1 });

    res.json(items);
  } catch (err) {
    console.error("❌ Error fetching ticker items:", err);
    res.status(500).json({ error: "Server error loading ticker" });
  }
});

export default router;
