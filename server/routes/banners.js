// server/routes/banners.js
import express from "express";
import multer from "multer";
import { GridFsStorage } from "multer-gridfs-storage";
import mongoose from "mongoose";
import Banner from "../models/Banner.js";
import { isAdmin } from "./utils.js";

const router = express.Router();

const storage = new GridFsStorage({
  url: process.env.MONGO_URI,
  file: (_req, file) => ({
    filename: Date.now() + "-" + file.originalname.replace(/\s+/g, "_"),
    bucketName: "uploads",
    metadata: { folder: "banners", mime: file.mimetype, original: file.originalname },
  }),
});
const upload = multer({ storage });

function fileUrlFromReq(req) {
  const id = req?.file?.id?.toString?.();
  return id ? `/api/files/${id}` : "";
}
function gridBucket() {
  const db = mongoose.connection?.db;
  if (!db) return null;
  return new mongoose.mongo.GridFSBucket(db, { bucketName: "uploads" });
}
function extractIdFromUrl(url = "") {
  const m = String(url).match(/\/api\/files\/([a-f0-9]{24})/i);
  return m ? m[1] : null;
}

/* ---------- Routes ---------- */

// List (public)
router.get("/", async (_req, res) => {
  try {
    const banners = await Banner.find({}).sort({ createdAt: -1 });
    res.json({ success: true, banners });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Create (admin) – accepts field name "file"
router.post("/", isAdmin, upload.single("file"), async (req, res) => {
  try {
    const url = fileUrlFromReq(req);
    if (!url) return res.status(400).json({ success: false, error: "File required" });

    const type = (req.file?.mimetype || "").startsWith("video") ? "video" : "image";
    const doc = await Banner.create({ title: "", type, url });

    res.json({ success: true, item: doc });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Delete (admin)
router.delete("/:id", isAdmin, async (req, res) => {
  try {
    const doc = await Banner.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: "Not found" });

    const oldId = extractIdFromUrl(doc?.url);
    if (oldId) {
      try {
        await gridBucket()?.delete(new mongoose.Types.ObjectId(oldId));
      } catch {}
    }

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
