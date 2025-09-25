import express from "express";
import mongoose from "mongoose";
import multer from "multer";
import { GridFsStorage } from "multer-gridfs-storage";
import { isAdmin } from "./utils.js";
import Article from "../models/Article.js";

const router = express.Router();

/* ---------- helpers ---------- */
const idUrl = (bucket, id) => (id ? `/api/files/${bucket}/${String(id)}` : "");
const parseFileUrl = (url = "") => {
  const m = String(url).match(/\/api\/files\/([^/]+)\/([a-f0-9]{24})/i);
  return m ? { bucket: m[1], id: m[2] } : null;
};
const delGrid = async (bucket, id) => {
  if (!id || !mongoose.isValidObjectId(id)) return;
  const db = mongoose.connection?.db;
  if (!db) return;
  const b = new mongoose.mongo.GridFSBucket(db, { bucketName: bucket });
  await b.delete(new mongoose.Types.ObjectId(id)).catch(() => {});
};

/* ---------- GridFS (bucket: articles) ---------- */
const storage = new GridFsStorage({
  url: process.env.MONGO_URI,
  file: (_req, file) => {
    const safe = (file.originalname || "file")
      .replace(/\s+/g, "_")
      .replace(/[^\w.\-]/g, "");
    return {
      filename: `${Date.now()}-${safe}`,
      bucketName: "articles",
      metadata: { mime: file.mimetype || "application/octet-stream", bucket: "articles" },
    };
  },
});
const upload = multer({ storage });

// Only invoke Multer on multipart/form-data
const maybeUpload = (field) => (req, res, next) => {
  const ct = req.headers["content-type"] || "";
  if (ct.startsWith("multipart/form-data")) return upload.single(field)(req, res, next);
  return next();
};

/* ---------- Routes ---------- */

// List
router.get("/", async (_req, res) => {
  try {
    const items = await Article.find({}).sort({ createdAt: -1 }).lean();
    res.json({ success: true, items });
  } catch (e) {
    console.error("Articles list:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// Create (JSON or multipart)
router.post("/", isAdmin, maybeUpload("image"), async (req, res) => {
  try {
    const { title, content = "", link = "", allowHtml = "false", isFree = "false" } = req.body;
    if (!title) return res.status(400).json({ success: false, error: "Title required" });

    const fid = req.file?.id || req.file?._id;
    const image = idUrl("articles", fid);

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
    console.error("Articles create:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// Update (JSON or multipart)
router.patch("/:id", isAdmin, maybeUpload("image"), async (req, res) => {
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
      const prevInfo = parseFileUrl(prev.image);
      if (prevInfo?.id) await delGrid(prevInfo.bucket || "articles", prevInfo.id);
      patch.image = idUrl("articles", req.file.id || req.file._id);
    }

    const item = await Article.findByIdAndUpdate(id, patch, { new: true });
    res.json({ success: true, item });
  } catch (e) {
    console.error("Articles update:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// Delete
router.delete("/:id", isAdmin, async (req, res) => {
  try {
    const doc = await Article.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: "Not found" });

    const info = parseFileUrl(doc.image);
    if (info?.id) await delGrid(info.bucket || "articles", info.id);

    res.json({ success: true, removed: doc });
  } catch (e) {
    console.error("Articles delete:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// Error handler
router.use((err, _req, res, _next) => {
  console.error("Articles route error:", err);
  res.status(err.status || 500).json({ success: false, message: err.message || "Server error" });
});

export default router;
