// server/routes/banners.js (ESM)
import express from "express";
import { isAdmin } from "./utils.js";
import Banner from "../models/Banner.js";
import { gridUpload, deleteFile, extractIdFromUrl } from "../utils/gfs.js";

const router = express.Router();
const uploadFile = gridUpload("banners", "file");

// List (public)
router.get("/", async (_req, res) => {
  try {
    const banners = await Banner.find({}).sort({ createdAt: -1 }).lean();
    res.json({ success: true, banners });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Create (admin) – file upload only
router.post("/", isAdmin, uploadFile, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: "No file uploaded" });
    const type = req.file?.metadata?.mime || req.file?.mimetype || "application/octet-stream";
    const url = `/api/files/banners/${String(req.file.id)}`;

    const item = await Banner.create({
      title: req.body.title || "",
      type: type.startsWith("video") ? "video" : "image",
      url,
    });
    res.json({ success: true, item });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Delete (admin)
router.delete("/:id", isAdmin, async (req, res) => {
  try {
    const doc = await Banner.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: "Not found" });

    const fileId = extractIdFromUrl(doc.url, "banners");
    if (fileId) await deleteFile("banners", fileId);

    res.json({ success: true, removed: doc });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Error handler
router.use((err, _req, res, _next) => {
  console.error("Banners route error:", err);
  res.status(err.status || 500).json({ success: false, message: err.message || "Server error" });
});

export default router;
