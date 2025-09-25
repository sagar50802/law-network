// server/routes/banners.js
import express from "express";
import multer from "multer";
import mongoose from "mongoose";
import { GridFsStorage } from "multer-gridfs-storage";
import Banner from "../models/Banner.js";
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
      bucketName: "banners",
      metadata: { mime: file.mimetype || "application/octet-stream", bucket: "banners" },
    };
  },
});
const upload = multer({ storage });
const uploadFile = uploadSafe(upload.single("file"));

/* list */
router.get("/", async (_req, res) => {
  try {
    const items = await Banner.find({}).sort({ createdAt: -1 }).lean();
    res.json({ success: true, banners: items });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/* create */
router.post("/", isAdmin, uploadFile, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: "File required" });
    const mime = req.file?.metadata?.mime || "application/octet-stream";
    const url = `/api/files/banners/${String(req.file.id)}`;
    const item = await Banner.create({
      title: (req.body.title || "").trim(),
      type: mime.startsWith("video") ? "video" : "image",
      url,
    });
    res.json({ success: true, item });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/* delete */
router.delete("/:id", isAdmin, async (req, res) => {
  try {
    const doc = await Banner.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: "Not found" });
    const oldId = extractIdFromUrl(doc.url, "banners");
    if (oldId) await deleteFromGrid("banners", oldId);
    res.json({ success: true, removed: doc });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
