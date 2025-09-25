import express from "express";
import multer from "multer";
import { GridFsStorage } from "multer-gridfs-storage";
import mongoose from "mongoose";
import { isAdmin } from "./utils.js";
import Consultancy from "../models/Consultancy.js";

const router = express.Router();

/* ---------------- helpers ---------------- */
function idUrl(bucket, id) {
  return id ? `/api/files/${bucket}/${String(id)}` : "";
}
function extractIdFromUrl(url = "", expectedBucket) {
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
      bucketName: "consultancy",
      metadata: { mime: file.mimetype || "application/octet-stream" },
    };
  },
});
const upload = multer({ storage });
const maybeUpload = (req, res, next) =>
  req.is("multipart/form-data") ? upload.single("image")(req, res, next) : next();

/* ---------------- routes ---------------- */

// List (public)
router.get("/", async (_req, res) => {
  try {
    const items = await Consultancy.find({}).sort({ order: 1, createdAt: -1 }).lean();
    res.json({ success: true, items });
  } catch (e) {
    console.error("Consultancy list error:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// Create (admin)
router.post("/", isAdmin, maybeUpload, async (req, res) => {
  try {
    const { title, subtitle = "", intro = "", order = 0 } = req.body;
    if (!title) return res.status(400).json({ success: false, error: "Title required" });
    if (!req.file) return res.status(400).json({ success: false, error: "Image required" });

    const fileId = req.file?.id || req.file?._id;
    const image = idUrl("consultancy", fileId);

    const item = await Consultancy.create({
      title,
      subtitle,
      intro,
      order: Number(order || 0),
      image,
    });
    res.json({ success: true, item });
  } catch (e) {
    console.error("Consultancy create error:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// Update (admin)
router.patch("/:id", isAdmin, maybeUpload, async (req, res) => {
  try {
    const { id } = req.params;
    const prev = await Consultancy.findById(id);
    if (!prev) return res.status(404).json({ success: false, error: "Not found" });

    const patch = {
      ...(req.body.title != null ? { title: req.body.title } : {}),
      ...(req.body.subtitle != null ? { subtitle: req.body.subtitle } : {}),
      ...(req.body.intro != null ? { intro: req.body.intro } : {}),
      ...(req.body.order != null ? { order: Number(req.body.order) } : {}),
    };

    if (req.file) {
      const oldId = extractIdFromUrl(prev.image, "consultancy");
      await deleteFromGrid("consultancy", oldId);

      const fileId = req.file?.id || req.file?._id;
      patch.image = idUrl("consultancy", fileId);
    }

    const updated = await Consultancy.findByIdAndUpdate(id, patch, { new: true });
    res.json({ success: true, item: updated });
  } catch (e) {
    console.error("Consultancy update error:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// Delete (admin)
router.delete("/:id", isAdmin, async (req, res) => {
  try {
    const doc = await Consultancy.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: "Not found" });

    const fileId = extractIdFromUrl(doc.image, "consultancy");
    await deleteFromGrid("consultancy", fileId);

    res.json({ success: true, removed: doc });
  } catch (e) {
    console.error("Consultancy delete error:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// Error handler
router.use((err, _req, res, _next) => {
  console.error("Consultancy route error:", err);
  res.status(err.status || 500).json({ success: false, message: err.message || "Server error" });
});

export default router;
