import express from "express";
import multer from "multer";
import mongoose from "mongoose";
import { isAdmin } from "./utils.js";
import * as NewsModel from "../models/NewsItem.js";

const News = NewsModel.default || NewsModel;
const router = express.Router();

/* ---------- helpers ---------- */
async function makeStorage(bucket) {
  const { GridFsStorage } = await import("multer-gridfs-storage");
  return new GridFsStorage({
    url: process.env.MONGO_URI,
    // Always return a file spec; let fileFilter decide if we actually store
    file: (_req, file) => {
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

/* ---------- multer (skip empty file parts) ---------- */
const storage = await makeStorage("news");
const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    // If user clicked file input but didn't select a file, originalname is empty -> ignore
    if (!file || !file.originalname) return cb(null, false);
    cb(null, true);
  },
});

/* ---------- routes ---------- */

// List (public)
router.get("/", async (_req, res) => {
  try {
    const docs = await News.find({}).sort({ createdAt: -1 }).lean();
    res.json({
      success: true,
      news: docs.map((d) => ({
        id: String(d._id),
        title: d.title || "",
        link: d.link || "",
        image: d.image || "",
        createdAt: d.createdAt,
      })),
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Create (admin) — image optional and SAFE even if no image/empty part
router.post("/", isAdmin, upload.single("image"), async (req, res) => {
  try {
    const title = String(req.body?.title || "").trim();
    const link = String(req.body?.link || "").trim();
    if (!title) return res.status(400).json({ success: false, error: "Title required" });

    const image = req.file ? idUrl("news", req.file.id) : "";
    const doc = await News.create({ title, link, image });

    res.json({
      success: true,
      item: { id: String(doc._id), title: doc.title, link: doc.link, image: doc.image, createdAt: doc.createdAt },
    });
  } catch (e) {
    // Never crash the process
    res.status(500).json({ success: false, error: e.message });
  }
});

// Delete (admin) — also remove GridFS file if present
router.delete("/:id", isAdmin, async (req, res) => {
  try {
    const doc = await News.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: "Not found" });

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

// Error guard
router.use((err, _req, res, _next) => {
  console.error("News route error:", err);
  res.status(err.status || 500).json({ success: false, message: err.message || "Server error" });
});

export default router;
