// server/routes/articles.js
import express from "express";
import multer from "multer";
import mongoose from "mongoose";
import Article from "../models/Article.js";
import { isAdmin } from "./utils.js";

const router = express.Router();

/* helpers (inline) */
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

/* GridFS storage */
import { GridFsStorage } from "multer-gridfs-storage";
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

/* list */
router.get("/", async (_req, res) => {
  try {
    const items = await Article.find({}).sort({ createdAt: -1 }).lean();
    res.json({ success: true, items });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/* create */
router.post("/", isAdmin, uploadImage, async (req, res) => {
  try {
    const { title, content = "", link = "", allowHtml = "false", isFree = "false" } = req.body;
    if (!title) return res.status(400).json({ success: false, error: "Title required" });
    const image = req.file ? `/api/files/articles/${String(req.file.id)}` : "";
    const item = await Article.create({
      title,
      content,
      link,
      allowHtml: String(allowHtml) === "true",
      isFree: String(isFree) === "true",
      image,
    });
    res.json({ success: true, item });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/* update */
router.patch("/:id", isAdmin, uploadImage, async (req, res) => {
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
      const oldId = extractIdFromUrl(prev.image, "articles");
      if (oldId) await deleteFromGrid("articles", oldId);
      patch.image = `/api/files/articles/${String(req.file.id)}`;
    }

    const updated = await Article.findByIdAndUpdate(req.params.id, patch, { new: true });
    res.json({ success: true, item: updated });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/* delete */
router.delete("/:id", isAdmin, async (req, res) => {
  try {
    const doc = await Article.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: "Not found" });
    const oldId = extractIdFromUrl(doc.image, "articles");
    if (oldId) await deleteFromGrid("articles", oldId);
    res.json({ success: true, removed: doc });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
