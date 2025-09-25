// server/routes/consultancy.js
import express from "express";
import mongoose from "mongoose";
import multer from "multer";
import { GridFsStorage } from "multer-gridfs-storage";
import { isAdmin } from "./utils.js";
import Consultancy from "../models/Consultancy.js";

const router = express.Router();

/* ---------------- GridFS storage (bucket: consultancy) ---------------- */
const storage = new GridFsStorage({
  url: process.env.MONGO_URI,
  file: (_req, file) => {
    const safe = String(file?.originalname || "image")
      .replace(/\s+/g, "_")
      .replace(/[^\w.\-]/g, "");
    return {
      filename: `${Date.now()}-${safe}`,
      bucketName: "consultancy",
      metadata: { mime: file?.mimetype || "application/octet-stream" },
    };
  },
});
const upload = multer({ storage });
const uploadFields = upload.fields([
  { name: "image", maxCount: 1 },
  { name: "file", maxCount: 1 },
]);

/* ---------------- helpers ---------------- */
function bucket() {
  const db = mongoose.connection?.db;
  if (!db) return null;
  return new mongoose.mongo.GridFSBucket(db, { bucketName: "consultancy" });
}
function pickUploaded(req) {
  const f = req.files?.image?.[0] || req.files?.file?.[0] || null;
  if (!f) return { fileId: null, url: "" };
  const fileId = f.id || f._id;
  return {
    fileId,
    url: fileId ? `/api/files/consultancy/${String(fileId)}` : "",
  };
}
function extractIdFromUrl(url = "") {
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
    const items = await Consultancy.find({}).sort({ order: 1, createdAt: -1 }).lean();
    res.json({ success: true, items });
  } catch (e) {
    console.error("Consultancy list error:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// Create (admin)
router.post("/", isAdmin, uploadFields, async (req, res) => {
  try {
    const { title, subtitle = "", intro = "", order = 0 } = req.body;
    if (!title) return res.status(400).json({ success: false, error: "Title required" });

    const { url } = pickUploaded(req);
    if (!url) return res.status(400).json({ success: false, error: "Image required" });

    const item = await Consultancy.create({
      title,
      subtitle,
      intro,
      order: Number(order || 0),
      image: url,
    });
    res.json({ success: true, item });
  } catch (e) {
    console.error("Consultancy create error:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// Update (admin)
router.patch("/:id", isAdmin, uploadFields, async (req, res) => {
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

    const uploaded = pickUploaded(req);
    if (uploaded.fileId) {
      const old = extractIdFromUrl(prev.image);
      if (old?.bucket === "consultancy") await deleteGrid(old.id);
      patch.image = uploaded.url;
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

    const old = extractIdFromUrl(doc.image);
    if (old?.bucket === "consultancy") await deleteGrid(old.id);

    res.json({ success: true, removed: doc });
  } catch (e) {
    console.error("Consultancy delete error:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

// Safety net
router.use((err, _req, res, _next) => {
  console.error("Consultancy route error:", err);
  res.status(err.status || 500).json({ success: false, message: err.message || "Server error" });
});

export default router;
