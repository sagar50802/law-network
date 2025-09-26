// server/routes/news.js  (ESM)
import express from "express";
import multer from "multer";
import mongoose from "mongoose";
import { isAdmin } from "./utils.js";
import * as NewsModel from "../models/NewsItem.js";

const News = NewsModel.default || NewsModel;
const router = express.Router();

/* ---------- helpers (same pattern you used elsewhere) ---------- */
async function makeStorage(bucket) {
  const { GridFsStorage } = await import("multer-gridfs-storage");
  return new GridFsStorage({
    url: process.env.MONGO_URI,
    file: (_req, file) => {
      // Always return a spec; never return null/undefined
      const safe = (file?.originalname || "file")
        .replace(/\s+/g, "_")
        .replace(/[^\w.\-]/g, "");
      return {
        filename: `${Date.now()}-${safe}`,
        bucketName: bucket,
        metadata: { mime: file?.mimetype || "application/octet-stream" },
      };
    },
  });
}
function grid(bucket) {
  const db = mongoose.connection?.db;
  if (!db) return null;
  return new mongoose.mongo.GridFSBucket(db, { bucketName: bucket });
}
function idUrl(bucket, id) {
  return id ? `/api/files/${bucket}/${String(id)}` : "";
}
function extractIdFromUrl(url = "", expectedBucket) {
  const m = String(url).match(/^\/api\/files\/([^/]+)\/([a-f0-9]{24})$/i);
  if (!m) return null;
  const [, b, id] = m;
  if (expectedBucket && b !== expectedBucket) return null;
  return id;
}

/* ---------- multer storage ---------- */
const storage = await makeStorage("news");
const upload = multer({ storage });

/* ---------- routes ---------- */

// List (public)
router.get("/", async (_req, res) => {
  try {
    const docs = await News.find({}).sort({ createdAt: -1 }).lean();
    // keep your client-friendly shape
    const news = docs.map((d) => ({
      id: String(d._id),
      title: d.title || "",
      link: d.link || "",
      image: d.image || "", // may be /api/files/news/<id> or empty
      createdAt: d.createdAt,
    }));
    res.json({ success: true, news });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Create (admin). Works with OR without an uploaded image.
router.post("/", isAdmin, upload.single("image"), async (req, res) => {
  try {
    const { title = "", link = "" } = req.body || {};
    if (!title.trim()) {
      return res.status(400).json({ success: false, error: "Title required" });
    }

    const image = req.file ? idUrl("news", req.file.id) : "";

    const doc = await News.create({
      title: String(title).trim(),
      link: String(link || "").trim(),
      image,
    });

    res.json({
      success: true,
      item: {
        id: String(doc._id),
        title: doc.title,
        link: doc.link,
        image: doc.image,
        createdAt: doc.createdAt,
      },
    });
  } catch (e) {
    // Never crash; return a clean error
    res.status(500).json({ success: false, error: e.message });
  }
});

// Delete (admin)
router.delete("/:id", isAdmin, async (req, res) => {
  try {
    const doc = await News.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: "Not found" });

    // If it had an image in the news bucket, remove the GridFS file
    const oldId = extractIdFromUrl(doc.image, "news");
    if (oldId) {
      const b = grid("news");
      await b?.delete(new mongoose.Types.ObjectId(oldId)).catch(() => {});
    }

    res.json({ success: true, removed: { id: String(doc._id) } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/* ---------- error handler ---------- */
router.use((err, _req, res, _next) => {
  console.error("News route error:", err);
  res.status(err.status || 500).json({ success: false, message: err.message || "Server error" });
});

export default router;
