// server/routes/articles.js (ESM)
import express from "express";
import multer from "multer";
import mongoose from "mongoose";
import Article from "../models/Article.js";
import { isAdmin } from "./utils.js";

const router = express.Router();

/* --------- local helpers (no external utils) --------- */
async function makeStorage(bucket) {
  const { GridFsStorage } = await import("multer-gridfs-storage");
  return new GridFsStorage({
    url: process.env.MONGO_URI,
    file: (req, file) => {
      const safe = (file.originalname || "file")
        .replace(/\s+/g, "_")
        .replace(/[^\w.\-]/g, "");
      return {
        filename: `${Date.now()}-${safe}`,
        bucketName: bucket,
        metadata: { mime: file.mimetype || "application/octet-stream" },
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
  const m = String(url).match(/\/api\/files\/([^/]+)\/([a-f0-9]{24})/i);
  if (!m) return null;
  const [, b, id] = m;
  if (expectedBucket && b !== expectedBucket) return null;
  return id;
}

/* --------- multer (GridFS) --------- */
const storage = await makeStorage("articles");
const upload = multer({ storage });
// safe wrapper (Multer errors -> 400 JSON)
const uploadSafe = (mw) => (req, res, next) =>
  mw(req, res, (err) => (err ? res.status(400).json({ success: false, error: err.message }) : next()));

/* --------- routes --------- */

// List
router.get("/", async (_req, res) => {
  try {
    const items = await Article.find({}).sort({ createdAt: -1 }).lean();
    res.json({ success: true, items });
  } catch (e) {
    console.error("Articles list error:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// Create (accepts JSON or multipart; image field name = "image")
router.post("/", isAdmin, uploadSafe(upload.single("image")), async (req, res) => {
  try {
    const { title, content = "", link = "", allowHtml = "false", isFree = "false" } = req.body;
    if (!title) return res.status(400).json({ success: false, error: "Title required" });

    const fileId = req.file?.id || req.file?._id;
    const image = idUrl("articles", fileId);

    const doc = await Article.create({
      title,
      content,
      link,
      allowHtml: String(allowHtml) === "true",
      isFree: String(isFree) === "true",
      image,
    });

    res.json({ success: true, item: doc });
  } catch (e) {
    console.error("Articles create error:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// Update (accepts JSON or multipart; can replace image)
router.patch("/:id", isAdmin, uploadSafe(upload.single("image")), async (req, res) => {
  try {
    const { id } = req.params;
    const prev = await Article.findById(id);
    if (!prev) return res.status(404).json({ success: false, error: "Not found" });

    const patch = {
      ...(req.body.title != null ? { title: req.body.title } : {}),
      ...(req.body.content != null ? { content: req.body.content } : {}),
      ...(req.body.link != null ? { link: req.body.link } : {}),
      ...(req.body.allowHtml != null ? { allowHtml: String(req.body.allowHtml) === "true" } : {}),
      ...(req.body.isFree != null ? { isFree: String(req.body.isFree) === "true" } : {}),
    };

    // replace image if provided
    if (req.file) {
      const oldId = extractIdFromUrl(prev.image, "articles");
      if (oldId && mongoose.isValidObjectId(oldId)) {
        try { await grid("articles")?.delete(new mongoose.Types.ObjectId(oldId)); } catch {}
      }
      const newId = req.file?.id || req.file?._id;
      patch.image = idUrl("articles", newId);
    }

    const updated = await Article.findByIdAndUpdate(id, patch, { new: true });
    res.json({ success: true, item: updated });
  } catch (e) {
    console.error("Articles update error:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// Delete
router.delete("/:id", isAdmin, async (req, res) => {
  try {
    const doc = await Article.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: "Not found" });

    const oldId = extractIdFromUrl(doc.image, "articles");
    if (oldId && mongoose.isValidObjectId(oldId)) {
      try { await grid("articles")?.delete(new mongoose.Types.ObjectId(oldId)); } catch {}
    }
    res.json({ success: true, removed: doc });
  } catch (e) {
    console.error("Articles delete error:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// Errors
router.use((err, _req, res, _next) => {
  console.error("Articles route error:", err);
  res.status(err.status || 500).json({ success: false, message: err.message || "Server error" });
});

export default router;
