import express from "express";
import LiveProgramSlide from "../models/LiveProgramSlide.js";
import LiveTickerItem from "../models/LiveTickerItem.js";

const router = express.Router();

/**
 * 🔐 Check admin key
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
 * POST /api/admin/live/slide
 * Create a new slide
 */
router.post("/slide", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    const body = { ...req.body };

    // 🧹 Normalize avatars -> debateAvatars and filter invalid
    if (Array.isArray(body.avatars)) {
      body.debateAvatars = body.avatars
        .filter(
          (a) =>
            a &&
            typeof a.name === "string" &&
            a.name.trim() &&
            typeof a.role === "string" &&
            a.role.trim()
        )
        .map((a, i) => ({
          code: a.code || `A${i + 1}`,
          name: a.name.trim(),
          role: a.role.trim(),
          avatarType: a.avatarType || "LAWYER",
        }));
    }

    // ✅ Make active by default
    body.isActive = true;

    const slide = await LiveProgramSlide.create(body);
    res.json(slide);
  } catch (err) {
    console.error("❌ Error creating slide:", err.message, err.errors);
    res
      .status(500)
      .json({ error: err.message || "Failed to create slide" });
  }
});

/**
 * GET /api/admin/live/slides
 */
router.get("/slides", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    const slides = await LiveProgramSlide.find().sort({ createdAt: -1 });
    res.json(slides);
  } catch (err) {
    console.error("❌ Error fetching slides:", err.message);
    res.status(500).json({ error: "Failed to fetch slides" });
  }
});

/**
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
    console.error("❌ Error updating slide:", err.message);
    res.status(500).json({ error: "Failed to update slide" });
  }
});

/**
 * DELETE /api/admin/live/slide/:id
 */
router.delete("/slide/:id", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    await LiveProgramSlide.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error("❌ Error deleting slide:", err.message);
    res.status(500).json({ error: "Failed to delete slide" });
  }
});

/**
 * DELETE /api/admin/live/slides
 * Clear all slides (optional)
 */
router.delete("/slides", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    await LiveProgramSlide.deleteMany({});
    res.json({ ok: true });
  } catch (err) {
    console.error("❌ Error clearing slides:", err.message);
    res.status(500).json({ error: "Failed to clear slides" });
  }
});

/* ============================================================
   📰 TICKER MANAGEMENT
============================================================ */

/**
 * POST /api/admin/live/ticker
 */
router.post("/ticker", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    const data = { ...req.body, isActive: true };
    const item = await LiveTickerItem.create(data);
    res.json(item);
  } catch (err) {
    console.error("❌ Error creating ticker:", err.message);
    res.status(500).json({ error: "Failed to create ticker" });
  }
});

/**
 * GET /api/admin/live/tickers
 */
router.get("/tickers", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    const items = await LiveTickerItem.find().sort({ createdAt: -1 });
    res.json(items);
  } catch (err) {
    console.error("❌ Error fetching tickers:", err.message);
    res.status(500).json({ error: "Failed to fetch tickers" });
  }
});

/**
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
    console.error("❌ Error updating ticker:", err.message);
    res.status(500).json({ error: "Failed to update ticker" });
  }
});

/**
 * DELETE /api/admin/live/ticker/:id
 */
router.delete("/ticker/:id", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  try {
    await LiveTickerItem.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error("❌ Error deleting ticker:", err.message);
    res.status(500).json({ error: "Failed to delete ticker" });
  }
});

export default router;
