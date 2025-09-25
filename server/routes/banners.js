// server/routes/banners.js
import express from "express";
import multer from "multer";
import mongoose from "mongoose";
import { GridFsStorage } from "multer-gridfs-storage";
import { isAdmin } from "./utils.js";
import Banner from "../models/Banner.js"; // your existing model

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

/* GridFS storage -> bucket: "banners" */
const storage = new GridFsStorage({
  url: process.env.MONGO_URI,
  file: (_req, file) => {
    const safe = (file.originalname || "file").replace(/\s+/g, "_").replace(/[^\w.\-]/g, "");
    return {
      filename: `${Date.now()}-${safe}`,
      bucketName: "banners",
      metadata: { mime: file.mimetype || "application/octet-stream", bucket: "banners" },
    };
  },
});
const upload = multer({ storage });
const uploadFile = uploadSafe(upload.single("file")); // admin dashboard uses "file"

/* Routes */

// List (public)
router.get("/", async (_req, res) => {
  try {
    const items = await Banner.find({}).sort({ createdAt: -1 }).lean();
    res.json({ success: true, items, banners: items });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Create (admin)
router.post("/", isAdmin, uploadFile, async (req, res) => {
  try {
    if (!req.file?.id) {
      return res.status(400).json({ success: false, error: "File required" });
    }
    const url = `/api/files/banners/${String(req.file.id)}`;
    const type = (req.file.mimetype || "").startsWith("video") ? "video" : "image";
    const title = req.body.title || "";
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
    if (fileId) await deleteFromGrid("banners", fileId);

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
