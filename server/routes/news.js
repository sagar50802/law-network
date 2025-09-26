// server/routes/news.js (ESM)
import express from "express";
import multer from "multer";
import mongoose from "mongoose";
import { isAdmin } from "./utils.js";
import * as NewsModel from "../models/News.js";

const News = NewsModel.default || NewsModel;
const router = express.Router();

/* helpers */
async function makeStorage(bucket) {
  const { GridFsStorage } = await import("multer-gridfs-storage");
  return new GridFsStorage({
    url: process.env.MONGO_URI,
    file: (_req, file) => {
      const safe = (file.originalname || "file")
        .replace(/\s+/g, "_")
        .replace(/[^\w.\-]/g, "");
      return {
        filename: `${Date.now()}-${safe}`,
        bucketName: bucket,
        metadata: { mime: file.mimetype || "application/octet-stream" },
      };
    },
  });
}
function grid(bucket) {
  const db = mongoose.connection?.db;
  if (!db) return null;
  return new mongoose.mongo.GridFSBucket(db, { bucketName: bucket });
}
function idUrl(bucket, id) {
  return id ? `/api/files/${bucket}/${String(id)}` : "";
}
function extractIdFromUrl(url = "", expectedBucket) {
  const m = String(url).match(/^\/api\/files\/([^/]+)\/([a-f0-9]{24})$/i);
  if (!m) return null;
  const [, b, id] = m;
  if (expectedBucket && b !== expectedBucket) return null;
  return id;
}

/* storage */
const storage = await makeStorage("news");
const upload = multer({ storage });

/* list (public) */
router.get("/", async (_req, res) => {
  try {
    const items = await News.find({}).sort({ createdAt: -1 }).lean();
    res.json({ success: true, news: items });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/* create (admin) */
router.post("/", isAdmin, upload.single("image"), async (req, res) => {
  try {
    const { title = "", link = "" } = req.body;
    if (!title.trim()) return res.status(400).json({ success: false, error: "Title required" });

    const image = req.file ? idUrl("news", req.file.id) : "";  // ✅ real id here

    const doc = await News.create({
      title: title.trim(),
      link: link.trim(),
      image,
    });

    res.json({ success: true, item: doc });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/* patch (admin, optional) */
router.patch("/:id", isAdmin, upload.single("image"), async (req, res) => {
  try {
    const prev = await News.findById(req.params.id);
    if (!prev) return res.status(404).json({ success: false, error: "Not found" });

    const patch = {
      ...(req.body.title != null ? { title: String(req.body.title) } : {}),
      ...(req.body.link != null ? { link: String(req.body.link) } : {}),
    };

    if (req.file) {
      const oldId = extractIdFromUrl(prev.image, "news");
      if (oldId) {
        const b = grid("news");
        await b?.delete(new mongoose.Types.ObjectId(oldId)).catch(() => {});
      }
      patch.image = idUrl("news", req.file.id);               // ✅ real id here
    }

    const updated = await News.findByIdAndUpdate(req.params.id, patch, { new: true });
    res.json({ success: true, item: updated });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/* delete (admin) */
router.delete("/:id", isAdmin, async (req, res) => {
  try {
    const doc = await News.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: "Not found" });

    const oldId = extractIdFromUrl(doc.image, "news");
    if (oldId) {
      const b = grid("news");
      await b?.delete(new mongoose.Types.ObjectId(oldId)).catch(() => {});
    }

    res.json({ success: true, removed: doc._id });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
