import express from "express";
import LiveProgramSlide from "../models/LiveProgramSlide.js";
import LiveTickerItem from "../models/LiveTickerItem.js";

const router = express.Router();

/**
 * Utility: Check admin key
 */
function requireAdmin(req, res) {
  const key = req.headers["x-admin-key"];
  if (!key || key !== process.env.ADMIN_KEY) {
    res.status(403).json({ error: "Forbidden: Invalid Admin Key" });
    return false;
  }
  return true;
}

/* ============================================================
   🎬 SLIDES MANAGEMENT
============================================================ */

/**
 * Create a new Live Slide
 * POST /api/admin/live/slide
 */
router.post("/slide", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    // ✅ normalize field names for safety
    const body = { ...req.body };

    // Support both avatars[] and debateAvatars[]
    if (Array.isArray(body.avatars) && body.avatars.length) {
      body.debateAvatars = body.avatars;
    }

    // Mark slide active immediately
    body.isActive = true;

    const slide = await LiveProgramSlide.create(body);
    res.json(slide);
  } catch (err) {
    console.error("Error creating slide:", err);
    res.status(500).json({ error: "Failed to create slide" });
  }
});

/**
 * Get all slides (for admin console)
 * GET /api/admin/live/slides
 */
router.get("/slides", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    const slides = await LiveProgramSlide.find().sort({ createdAt: -1 });
    res.json(slides);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch slides" });
  }
});

/**
 * Update an existing slide
 * PUT /api/admin/live/slide/:id
 */
router.put("/slide/:id", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    const updated = await LiveProgramSlide.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to update slide" });
  }
});

/**
 * Delete a slide
 * DELETE /api/admin/live/slide/:id
 */
router.delete("/slide/:id", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    await LiveProgramSlide.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete slide" });
  }
});

/**
 * Clear all slides (optional cleanup route)
 * DELETE /api/admin/live/slides
 */
router.delete("/slides", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    await LiveProgramSlide.deleteMany({});
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to clear slides" });
  }
});

/* ============================================================
   📰 TICKER MANAGEMENT
============================================================ */

/**
 * Create a new ticker item
 * POST /api/admin/live/ticker
 */
router.post("/ticker", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    const data = { ...req.body, isActive: true };
    const item = await LiveTickerItem.create(data);
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: "Failed to create ticker" });
  }
});

/**
 * Get all ticker items
 * GET /api/admin/live/tickers
 */
router.get("/tickers", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    const items = await LiveTickerItem.find().sort({ createdAt: -1 });
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch tickers" });
  }
});

/**
 * Update a ticker item
 * PUT /api/admin/live/ticker/:id
 */
router.put("/ticker/:id", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    const updated = await LiveTickerItem.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: "Failed to update ticker" });
  }
});

/**
 * Delete a ticker item
 * DELETE /api/admin/live/ticker/:id
 */
router.delete("/ticker/:id", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    await LiveTickerItem.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: "Failed to delete ticker" });
  }
});

export default router;
