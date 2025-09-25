// server/routes/consultancy.js (ESM)
import express from "express";
import multer from "multer";
import mongoose from "mongoose";
import Consultancy from "../models/Consultancy.js";
import { isAdmin } from "./utils.js";

const router = express.Router();

/* -------- helpers -------- */
async function makeStorage(bucket) {
  const { GridFsStorage } = await import("multer-gridfs-storage");
  return new GridFsStorage({
    url: process.env.MONGO_URI,
    file: (_req, file) => {
      const safe = (file.originalname || "file").replace(/\s+/g, "_").replace(/[^\w.\-]/g, "");
      return { filename: `${Date.now()}-${safe}`, bucketName: bucket, metadata: { mime: file.mimetype || "application/octet-stream" } };
    },
  });
}
function grid(bucket) {
  const db = mongoose.connection?.db;
  if (!db) return null;
  return new mongoose.mongo.GridFSBucket(db, { bucketName: bucket });
}
function idUrl(bucket, id) { return id ? `/api/files/${bucket}/${String(id)}` : ""; }
function extractIdFromUrl(url = "", expectedBucket) {
  const m = String(url).match(/\/api\/files\/([^/]+)\/([a-f0-9]{24})/i);
  if (!m) return null;
  const [, b, id] = m;
  if (expectedBucket && b !== expectedBucket) return null;
  return id;
}

/* -------- multer -------- */
const storage = await makeStorage("consultancy");
const upload = multer({ storage });
const uploadSafe = (mw) => (req, res, next) =>
  mw(req, res, (err) => (err ? res.status(400).json({ success: false, error: err.message }) : next()));

/* -------- routes -------- */

// List
router.get("/", async (_req, res) => {
  try {
    const items = await Consultancy.find({}).sort({ order: 1, createdAt: -1 }).lean();
    res.json({ success: true, items });
  } catch (e) {
    console.error("Consultancy list error:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// Create
router.post("/", isAdmin, uploadSafe(upload.single("image")), async (req, res) => {
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

// Update / replace image
router.patch("/:id", isAdmin, uploadSafe(upload.single("image")), async (req, res) => {
  try {
    const prev = await Consultancy.findById(req.params.id);
    if (!prev) return res.status(404).json({ success: false, error: "Not found" });

    const patch = {
      ...(req.body.title != null ? { title: req.body.title } : {}),
      ...(req.body.subtitle != null ? { subtitle: req.body.subtitle } : {}),
      ...(req.body.intro != null ? { intro: req.body.intro } : {}),
      ...(req.body.order != null ? { order: Number(req.body.order) } : {}),
    };

    if (req.file) {
      const oldId = extractIdFromUrl(prev.image, "consultancy");
      if (oldId && mongoose.isValidObjectId(oldId)) {
        try { await grid("consultancy")?.delete(new mongoose.Types.ObjectId(oldId)); } catch {}
      }
      const newId = req.file?.id || req.file?._id;
      patch.image = idUrl("consultancy", newId);
    }

    const updated = await Consultancy.findByIdAndUpdate(req.params.id, patch, { new: true });
    res.json({ success: true, item: updated });
  } catch (e) {
    console.error("Consultancy update error:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// Delete
router.delete("/:id", isAdmin, async (req, res) => {
  try {
    const doc = await Consultancy.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: "Not found" });

    const oldId = extractIdFromUrl(doc.image, "consultancy");
    if (oldId && mongoose.isValidObjectId(oldId)) {
      try { await grid("consultancy")?.delete(new mongoose.Types.ObjectId(oldId)); } catch {}
    }
    res.json({ success: true, removed: doc });
  } catch (e) {
    console.error("Consultancy delete error:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// Errors
router.use((err, _req, res, _next) => {
  console.error("Consultancy route error:", err);
  res.status(err.status || 500).json({ success: false, message: err.message || "Server error" });
});

export default router;
