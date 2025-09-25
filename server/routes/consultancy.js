import express from "express";
import mongoose from "mongoose";
import multer from "multer";
import { GridFsStorage } from "multer-gridfs-storage";
import { isAdmin } from "./utils.js";
import Consultancy from "../models/Consultancy.js";

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

/* ---------- GridFS (bucket: consultancy) ---------- */
const storage = new GridFsStorage({
  url: process.env.MONGO_URI,
  file: (_req, file) => {
    const safe = (file.originalname || "file")
      .replace(/\s+/g, "_")
      .replace(/[^\w.\-]/g, "");
    return {
      filename: `${Date.now()}-${safe}`,
      bucketName: "consultancy",
      metadata: { mime: file.mimetype || "application/octet-stream", bucket: "consultancy" },
    };
  },
});
const upload = multer({ storage });
const maybeUpload = (field) => (req, res, next) => {
  const ct = req.headers["content-type"] || "";
  if (ct.startsWith("multipart/form-data")) return upload.single(field)(req, res, next);
  return next();
};

/* ---------- Routes ---------- */

// List (public)
router.get("/", async (_req, res) => {
  try {
    const items = await Consultancy.find({}).sort({ order: 1, createdAt: -1 }).lean();
    res.json({ success: true, items });
  } catch (e) {
    console.error("Consultancy list:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// Create (admin)
router.post("/", isAdmin, maybeUpload("image"), async (req, res) => {
  try {
    const { title, subtitle = "", intro = "", order = 0 } = req.body;
    if (!title) return res.status(400).json({ success: false, error: "Title required" });
    const fid = req.file?.id || req.file?._id;
    if (!fid) return res.status(400).json({ success: false, error: "Image required" });

    const image = idUrl("consultancy", fid);
    const item = await Consultancy.create({
      title,
      subtitle,
      intro,
      order: Number(order || 0),
      image,
    });
    res.json({ success: true, item });
  } catch (e) {
    console.error("Consultancy create:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// Update (admin)
router.patch("/:id", isAdmin, maybeUpload("image"), async (req, res) => {
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
      const p = parseFileUrl(prev.image);
      if (p?.id) await delGrid(p.bucket || "consultancy", p.id);
      patch.image = idUrl("consultancy", req.file.id || req.file._id);
    }

    const item = await Consultancy.findByIdAndUpdate(id, patch, { new: true });
    res.json({ success: true, item });
  } catch (e) {
    console.error("Consultancy update:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// Delete (admin)
router.delete("/:id", isAdmin, async (req, res) => {
  try {
    const doc = await Consultancy.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: "Not found" });

    const p = parseFileUrl(doc.image);
    if (p?.id) await delGrid(p.bucket || "consultancy", p.id);

    res.json({ success: true, removed: doc });
  } catch (e) {
    console.error("Consultancy delete:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// Error handler
router.use((err, _req, res, _next) => {
  console.error("Consultancy route error:", err);
  res.status(err.status || 500).json({ success: false, message: err.message || "Server error" });
});

export default router;
