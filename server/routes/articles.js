// server/routes/articles.js
import express from "express";
import mongoose from "mongoose";
import multer from "multer";
import { GridFsStorage } from "multer-gridfs-storage";
import { isAdmin } from "./utils.js";
import Article from "../models/Article.js";

const router = express.Router();

/* ---------------- GridFS storage (bucket: articles) ---------------- */
const storage = new GridFsStorage({
  url: process.env.MONGO_URI,
  file: (_req, file) => {
    const safe = String(file?.originalname || "image")
      .replace(/\s+/g, "_")
      .replace(/[^\w.\-]/g, "");
    return {
      filename: `${Date.now()}-${safe}`,
      bucketName: "articles",
      metadata: { mime: file?.mimetype || "application/octet-stream" },
    };
  },
});
const upload = multer({ storage });

// accept either "image" or "file"
const uploadFields = upload.fields([
  { name: "image", maxCount: 1 },
  { name: "file", maxCount: 1 },
]);

/* ---------------- helpers ---------------- */
function bucket() {
  const db = mongoose.connection?.db;
  if (!db) return null;
  return new mongoose.mongo.GridFSBucket(db, { bucketName: "articles" });
}
function pickUploaded(req) {
  const f = req.files?.image?.[0] || req.files?.file?.[0] || null;
  if (!f) return { fileId: null, url: "" };
  const fileId = f.id || f._id;
  return {
    fileId,
    url: fileId ? `/api/files/articles/${String(fileId)}` : "",
  };
}
function extractIdFromUrl(url = "") {
  // works for relative or absolute URLs
  const m = String(url).match(/\/api\/files\/([^/]+)\/([a-f0-9]{24})/i);
  return m ? { bucket: m[1], id: m[2] } : null;
}
async function deleteGrid(id) {
  if (!id || !mongoose.isValidObjectId(id)) return;
  const b = bucket();
  if (!b) return;
  await b.delete(new mongoose.Types.ObjectId(id)).catch(() => {});
}

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

// Create (admin)
router.post("/", isAdmin, uploadFields, async (req, res) => {
  try {
    const { title, content = "", link = "", allowHtml = "false", isFree = "false" } = req.body;
    if (!title) return res.status(400).json({ success: false, error: "Title required" });

    const { url } = pickUploaded(req);

    const doc = await Article.create({
      title,
      content,
      link,
      allowHtml: String(allowHtml) === "true",
      isFree: String(isFree) === "true",
      image: url, // GridFS URL (or empty string)
    });

    res.json({ success: true, item: doc });
  } catch (e) {
    console.error("Articles create error:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// Update (admin)
router.patch("/:id", isAdmin, uploadFields, async (req, res) => {
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

    const uploaded = pickUploaded(req);
    if (uploaded.fileId) {
      const old = extractIdFromUrl(prev.image);
      if (old?.bucket === "articles") await deleteGrid(old.id);
      patch.image = uploaded.url;
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

    const old = extractIdFromUrl(doc.image);
    if (old?.bucket === "articles") await deleteGrid(old.id);

    res.json({ success: true, removed: doc });
  } catch (e) {
    console.error("Articles delete error:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// Safety net
router.use((err, _req, res, _next) => {
  console.error("Articles route error:", err);
  res.status(err.status || 500).json({ success: false, message: err.message || "Server error" });
});

export default router;
