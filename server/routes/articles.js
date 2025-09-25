// server/routes/articles.js
import express from "express";
import multer from "multer";
import mongoose from "mongoose";
import { GridFsStorage } from "multer-gridfs-storage";
import Article from "../models/Article.js";
import { isAdmin } from "./utils.js";

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

/* GridFS storage for images -> bucket: "articles" */
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
const uploadImage = uploadSafe(upload.single("image"));

/* Routes */

// List (public)
router.get("/", async (_req, res) => {
  try {
    const items = await Article.find({}).sort({ createdAt: -1 }).lean();
    res.json({ success: true, items, articles: items });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Create (admin)
router.post("/", isAdmin, uploadImage, async (req, res) => {
  try {
    const { title, content = "", link = "", allowHtml = "false", isFree = "false" } = req.body;
    if (!title) return res.status(400).json({ success: false, error: "Title required" });

    let image = "";
    if (req.file?.id) image = `/api/files/articles/${String(req.file.id)}`;

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
    res.status(500).json({ success: false, error: e.message });
  }
});

// Update (admin)
router.patch("/:id", isAdmin, uploadImage, async (req, res) => {
  try {
    const { id } = req.params;
    const prev = await Article.findById(id);
    if (!prev) return res.status(404).json({ success: false, error: "Not found" });

    const patch = {
      ...(req.body.title != null ? { title: req.body.title } : {}),
      ...(req.body.content != null ? { content: req.body.content } : {}),
      ...(req.body.link != null ? { link: req.body.link } : {}),
      ...(req.body.allowHtml != null
        ? { allowHtml: String(req.body.allowHtml) === "true" }
        : {}),
      ...(req.body.isFree != null ? { isFree: String(req.body.isFree) === "true" } : {}),
    };

    if (req.file?.id) {
      const oldId = extractIdFromUrl(prev.image, "articles");
      if (oldId) await deleteFromGrid("articles", oldId);
      patch.image = `/api/files/articles/${String(req.file.id)}`;
    }

    const updated = await Article.findByIdAndUpdate(id, patch, { new: true });
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

    const fileId = extractIdFromUrl(doc.image, "articles");
    if (fileId) await deleteFromGrid("articles", fileId);

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
