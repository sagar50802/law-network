// server/routes/articles.js
import express from "express";
import multer from "multer";
import { GridFsStorage } from "multer-gridfs-storage";
import mongoose from "mongoose";
import Article from "../models/Article.js";
import { createRequire } from "module";

const { isAdmin } = createRequire(import.meta.url)("./utils.js");
const router = express.Router();

/* ---------- GridFS storage (bucket: articles) ---------- */
const storage = new GridFsStorage({
  url: process.env.MONGO_URI,
  file: (_req, file) => {
    const safe = (file.originalname || "file").replace(/\s+/g, "_").replace(/[^\w.\-]/g, "");
    return {
      filename: `${Date.now()}-${safe}`,
      bucketName: "articles",
      metadata: { mime: file.mimetype || "application/octet-stream", bucket: "articles" },
    };
  },
});
const upload = multer({ storage });

const imgUrl = (id) => (id ? `/api/files/articles/${String(id)}` : "");
const idFromUrl = (url = "") => (String(url).match(/^\/api\/files\/articles\/([a-f0-9]{24})$/i)?.[1] || null);
const deleteFile = async (id) => {
  if (!id || !mongoose.connection?.db) return;
  const b = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "articles" });
  await b.delete(new mongoose.Types.ObjectId(id)).catch(() => {});
};

/* ---------- Routes ---------- */

// List (public)
router.get("/", async (_req, res) => {
  try {
    const items = await Article.find({}).sort({ createdAt: -1 }).lean();
    res.json({ success: true, items });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Create (admin)
router.post("/", isAdmin, upload.single("image"), async (req, res) => {
  try {
    const { title, content = "", link = "", allowHtml = "false", isFree = "false" } = req.body;
    if (!title) return res.status(400).json({ success: false, error: "Title required" });

    const doc = await Article.create({
      title,
      content,
      link,
      allowHtml: String(allowHtml) === "true",
      isFree: String(isFree) === "true",
      image: imgUrl(req.file?.id),
    });

    res.json({ success: true, item: doc });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Update (admin)
router.patch("/:id", isAdmin, upload.single("image"), async (req, res) => {
  try {
    const prev = await Article.findById(req.params.id);
    if (!prev) return res.status(404).json({ success: false, error: "Not found" });

    const patch = {
      ...(req.body.title != null ? { title: req.body.title } : {}),
      ...(req.body.content != null ? { content: req.body.content } : {}),
      ...(req.body.link != null ? { link: req.body.link } : {}),
      ...(req.body.allowHtml != null ? { allowHtml: String(req.body.allowHtml) === "true" } : {}),
      ...(req.body.isFree != null ? { isFree: String(req.body.isFree) === "true" } : {}),
    };

    if (req.file) {
      const oldId = idFromUrl(prev.image);
      if (oldId) await deleteFile(oldId);
      patch.image = imgUrl(req.file.id);
    }

    const updated = await Article.findByIdAndUpdate(req.params.id, patch, { new: true });
    res.json({ success: true, item: updated });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Delete (admin)
router.delete("/:id", isAdmin, async (req, res) => {
  try {
    const doc = await Article.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: "Not found" });
    const oldId = idFromUrl(doc.image);
    if (oldId) await deleteFile(oldId);
    res.json({ success: true, removed: doc });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Error handler
router.use((err, _req, res, _next) => {
  console.error("Articles route error:", err);
  res.status(err.status || 500).json({ success: false, message: err.message || "Server error" });
});

export default router;
