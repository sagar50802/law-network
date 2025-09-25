// server/routes/news.js
import express from "express";
import multer from "multer";
import mongoose from "mongoose";
import { GridFsStorage } from "multer-gridfs-storage";
import { isAdmin } from "./utils.js";
import NewsItem from "../models/NewsItem.js";

const router = express.Router();

/* helpers */
function extractIdFromUrl(url = "", expectedBucket) {
  const m = String(url).match(/^\/api\/files\/([^/]+)\/([a-f0-9]{24})$/i);
  if (!m) return null;
  const [, b, id] = m;
  if (expectedBucket && b !== expectedBucket) return null;
  return id;
}
async function deleteFromGrid(bucket, id) {
  if (!id) return;
  const db = mongoose.connection?.db;
  if (!db) return;
  const b = new mongoose.mongo.GridFSBucket(db, { bucketName: bucket });
  await b.delete(new mongoose.Types.ObjectId(id)).catch(() => {});
}
const uploadSafe = (mw) => (req, res, next) =>
  mw(req, res, (err) =>
    err
      ? res.status(400).json({ success: false, error: err.message || "Upload failed" })
      : next()
  );

/* GridFS storage -> bucket: "news" */
const storage = new GridFsStorage({
  url: process.env.MONGO_URI,
  file: (_req, file) => {
    const safe = (file.originalname || "file").replace(/\s+/g, "_").replace(/[^\w.\-]/g, "");
    return {
      filename: `${Date.now()}-${safe}`,
      bucketName: "news",
      metadata: { mime: file.mimetype || "application/octet-stream", bucket: "news" },
    };
  },
});
const upload = multer({ storage });
const uploadImage = uploadSafe(upload.single("image"));

/* Routes */

// List
router.get("/", async (_req, res) => {
  try {
    const items = await NewsItem.find({}).sort({ createdAt: -1 }).lean();
    res.json({ success: true, items, news: items });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Create
router.post("/", isAdmin, uploadImage, async (req, res) => {
  try {
    const { title = "", link = "" } = req.body;
    const image = req.file?.id ? `/api/files/news/${String(req.file.id)}` : "";
    const item = await NewsItem.create({ title, link, image });
    res.json({ success: true, item });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Delete
router.delete("/:id", isAdmin, async (req, res) => {
  try {
    const doc = await NewsItem.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: "Not found" });

    const fileId = extractIdFromUrl(doc.image, "news");
    if (fileId) await deleteFromGrid("news", fileId);

    res.json({ success: true, removed: doc });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Error handler
router.use((err, _req, res, _next) => {
  console.error("News route error:", err);
  res.status(err.status || 500).json({ success: false, message: err.message || "Server error" });
});

export default router;
