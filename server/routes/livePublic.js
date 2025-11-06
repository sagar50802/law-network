import express from "express";
import LiveProgramSlide from "../models/LiveProgramSlide.js";
import LiveTickerItem from "../models/LiveTickerItem.js";

const router = express.Router();
const SIX_DAYS_MS = 6 * 24 * 60 * 60 * 1000;

// GET /api/live/slides
router.get("/slides", async (req, res) => {
  const now = Date.now();
  const since = new Date(now - SIX_DAYS_MS);

  const slides = await LiveProgramSlide.find({
    isActive: true,
    createdAt: { $gte: since }
  }).sort({ createdAt: 1 });

  res.json(slides);
});

// GET /api/live/ticker
router.get("/ticker", async (req, res) => {
  const now = Date.now();
  const since = new Date(now - SIX_DAYS_MS);

  const items = await LiveTickerItem.find({
    isActive: true,
    createdAt: { $gte: since }
  }).sort({ createdAt: 1 });

  res.json(items);
});

export default router;
