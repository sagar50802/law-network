import express from "express";
import LiveProgramSlide from "../models/LiveProgramSlide.js";
import LiveTickerItem from "../models/LiveTickerItem.js";

const router = express.Router();

// simple inline admin-key check
function requireAdmin(req, res) {
  const key = req.headers["x-admin-key"];
  if (!key || key !== process.env.ADMIN_KEY) {
    res.status(403).json({ error: "Forbidden" });
    return false;
  }
  return true;
}

// --- Slides ---

// POST /api/admin/live/slide
router.post("/slide", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const slide = await LiveProgramSlide.create(req.body);
  res.json(slide);
});

// GET /api/admin/live/slides
router.get("/slides", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const slides = await LiveProgramSlide.find().sort({ createdAt: -1 });
  res.json(slides);
});

// PUT /api/admin/live/slide/:id
router.put("/slide/:id", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const updated = await LiveProgramSlide.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true }
  );
  res.json(updated);
});

// DELETE /api/admin/live/slide/:id
router.delete("/slide/:id", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  await LiveProgramSlide.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

// --- Ticker ---

router.post("/ticker", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const item = await LiveTickerItem.create(req.body);
  res.json(item);
});

router.get("/tickers", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const items = await LiveTickerItem.find().sort({ createdAt: -1 });
  res.json(items);
});

router.put("/ticker/:id", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  const updated = await LiveTickerItem.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true }
  );
  res.json(updated);
});

router.delete("/ticker/:id", async (req, res) => {
  if (!requireAdmin(req, res)) return;

  await LiveTickerItem.findByIdAndDelete(req.params.id);
  res.json({ ok: true });
});

export default router;
