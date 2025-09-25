// server/routes/news.js (ESM)
import express from "express";
import { isAdmin } from "./utils.js";
import * as NewsModel from "../models/NewsItem.js";

const NewsItem = NewsModel.default || NewsModel;
const router = express.Router();

// list
router.get("/", async (_req, res) => {
  try {
    const items = await NewsItem.find({}).sort({ createdAt: -1 }).lean();
    res.json({ success: true, items });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// create
router.post("/", isAdmin, async (req, res) => {
  try {
    const { title, link = "", image = "" } = req.body || {};
    if (!title) return res.status(400).json({ success: false, error: "Title required" });
    const item = await NewsItem.create({ title, link, image });
    res.json({ success: true, item });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// delete
router.delete("/:id", isAdmin, async (req, res) => {
  try {
    const item = await NewsItem.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ success: false, error: "Not found" });
    res.json({ success: true, removed: item });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// error handler
router.use((err, _req, res, _next) => {
  console.error("News route error:", err);
  res.status(err.status || 500).json({ success: false, message: err.message || "Server error" });
});

export default router;
