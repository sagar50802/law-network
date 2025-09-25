// server/routes/consultancy.js
import express from "express";
import multer from "multer";
import mongoose from "mongoose";
import { GridFsStorage } from "multer-gridfs-storage";
import Consultancy from "../models/Consultancy.js";
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

/* storage */
const storage = new GridFsStorage({
  url: process.env.MONGO_URI,
  file: (_req, file) => {
    const safe = (file.originalname || "file").replace(/\s+/g, "_").replace(/[^\w.\-]/g, "");
    return {
      filename: `${Date.now()}-${safe}`,
      bucketName: "consultancy",
      metadata: { mime: file.mimetype || "application/octet-stream", bucket: "consultancy" },
    };
  },
});
const upload = multer({ storage });
const uploadImage = uploadSafe(upload.single("image"));

/* list */
router.get("/", async (_req, res) => {
  try {
    const items = await Consultancy.find({}).sort({ order: 1, createdAt: -1 }).lean();
    res.json({ success: true, items });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/* create */
router.post("/", isAdmin, uploadImage, async (req, res) => {
  try {
    const { title, subtitle = "", intro = "", order = 0 } = req.body;
    if (!title) return res.status(400).json({ success: false, error: "Title required" });
    if (!req.file) return res.status(400).json({ success: false, error: "Image required" });

    const image = `/api/files/consultancy/${String(req.file.id)}`;
    const item = await Consultancy.create({
      title,
      subtitle,
      intro,
      order: Number(order || 0),
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
      if (oldId) await deleteFromGrid("consultancy", oldId);
      patch.image = `/api/files/consultancy/${String(req.file.id)}`;
    }

    const updated = await Consultancy.findByIdAndUpdate(req.params.id, patch, { new: true });
    res.json({ success: true, item: updated });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/* delete */
router.delete("/:id", isAdmin, async (req, res) => {
  try {
    const doc = await Consultancy.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: "Not found" });
    const oldId = extractIdFromUrl(doc.image, "consultancy");
    if (oldId) await deleteFromGrid("consultancy", oldId);
    res.json({ success: true, removed: doc });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
