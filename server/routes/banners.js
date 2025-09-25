// server/routes/banners.js (ESM)
import express from "express";
import Banner from "../models/Banner.js";
import { isAdmin } from "./utils.js";
import { gridUploadAny, deleteFile, extractIdFromUrl } from "../utils/gfs.js";

const router = express.Router();
const uploadAny = gridUploadAny("banners");

// List (public)
router.get("/", async (_req, res) => {
  const banners = await Banner.find({}).sort({ createdAt: -1 }).lean();
  res.json({ success: true, banners });
});

// Create (admin) — accepts form field "file" or "image", OR body.url
router.post("/", isAdmin, uploadAny, async (req, res) => {
  try {
    const { title = "", url: remoteUrl = "" } = req.body;

    const f =
      (req.files || []).find((x) => x.fieldname === "file") ||
      (req.files || []).find((x) => x.fieldname === "image") ||
      null;

    let url, type;
    if (f) {
      const id = String(f.id);
      url = `/api/files/banners/${id}`;
      type = /^video\//i.test(f.mimetype) ? "video" : "image";
    } else if (remoteUrl?.trim()) {
      url = remoteUrl.trim();
      type = /\.(mp4|webm|mov|m4v)(\?|$)/i.test(url) ? "video" : "image";
    } else {
      return res.status(400).json({ success: false, error: "Provide a file or a URL" });
    }

    const item = await Banner.create({ title, type, url });
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
