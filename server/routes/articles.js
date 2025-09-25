import express from "express";
import multer from "multer";
import { GridFsStorage } from "multer-gridfs-storage";
import mongoose from "mongoose";
import { isAdmin } from "./utils.js";
import Article from "../models/Article.js";

const router = express.Router();

/* ---------------- helpers ---------------- */
function idUrl(bucket, id) {
  return id ? `/api/files/${bucket}/${String(id)}` : "";
}
function extractIdFromUrl(url = "", expectedBucket) {
  // works with /api/files/... and absolute https://.../api/files/...
  const m = String(url).match(/\/api\/files\/([^/]+)\/([a-f0-9]{24})/i);
  if (!m) return null;
  const [, bucket, id] = m;
  if (expectedBucket && bucket !== expectedBucket) return null;
  return id;
}
async function deleteFromGrid(bucket, id) {
  if (!id || !mongoose.isValidObjectId(id)) return;
  const db = mongoose.connection?.db;
  if (!db) return;
  const b = new mongoose.mongo.GridFSBucket(db, { bucketName: bucket });
  await b.delete(new mongoose.Types.ObjectId(id)).catch(() => {});
}

/* ---------------- multer-gridfs ---------------- */
const storage = new GridFsStorage({
  url: process.env.MONGO_URI,
  file: (_req, file) => {
    const safe = (file.originalname || "file").replace(/\s+/g, "_").replace(/[^\w.\-]/g, "");
    return {
      filename: `${Date.now()}-${safe}`,
      bucketName: "articles",
      metadata: { mime: file.mimetype || "application/octet-stream" },
    };
  },
});
const upload = multer({ storage });

/** Only run multer for multipart/form-data; otherwise continue. */
const maybeUpload = (req, res, next) =>
  req.is("multipart/form-data") ? upload.single("image")(req, res, next) : next();

/* ---------------- routes ---------------- */

// List (public)
router.get("/", async (_req, res) => {
  try {
    const items = await Article.find({}).sort({ createdAt: -1 }).lean();
    res.json({ success: true, items });
  } catch (e) {
    console.error("Articles list error:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// Create (admin) — works for JSON or multipart
router.post("/", isAdmin, maybeUpload, async (req, res) => {
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

// Update (admin) — supports JSON or multipart (image replace)
router.patch("/:id", isAdmin, maybeUpload, async (req, res) => {
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

    if (req.file) {
      const oldId = extractIdFromUrl(prev.image, "articles");
      await deleteFromGrid("articles", oldId);

      const fileId = req.file?.id || req.file?._id;
      patch.image = idUrl("articles", fileId);
    }

    const updated = await Article.findByIdAndUpdate(id, patch, { new: true });
    res.json({ success: true, item: updated });
  } catch (e) {
    console.error("Articles update error:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// Delete (admin)
router.delete("/:id", isAdmin, async (req, res) => {
  try {
    const doc = await Article.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: "Not found" });

    const oldId = extractIdFromUrl(doc.image, "articles");
    await deleteFromGrid("articles", oldId);

    res.json({ success: true, removed: doc });
  } catch (e) {
    console.error("Articles delete error:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// Error handler
router.use((err, _req, res, _next) => {
  console.error("Articles route error:", err);
  res.status(err.status || 500).json({ success: false, message: err.message || "Server error" });
});

export default router;
