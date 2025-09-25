// server/routes/news.js  (ESM)
import express from "express";
import mongoose from "mongoose";
import multer from "multer";
import { createRequire } from "module";
const requireCjs = createRequire(import.meta.url);
const { isAdmin } = requireCjs("./utils.js");

const router = express.Router();

/* ---------- Model ---------- */
const NewsItem =
  mongoose.models.NewsItem ||
  mongoose.model(
    "NewsItem",
    new mongoose.Schema(
      {
        title: { type: String, required: true },
        link:  { type: String, default: "" },
        image: { type: String, default: "" }, // e.g. "/api/files/news/<id>"
      },
      { timestamps: true }
    )
  );

/* ---------- GridFS storage (bucket: news) ---------- */
const { GridFsStorage } = await import("multer-gridfs-storage");
const storage = new GridFsStorage({
  url: process.env.MONGO_URI,
  file: (_req, file) => {
    const safe = (file.originalname || "file")
      .replace(/\s+/g, "_")
      .replace(/[^\w.\-]/g, "");
    return {
      filename: `${Date.now()}-${safe}`,
      bucketName: "news",
      metadata: { mime: file.mimetype || "application/octet-stream", bucket: "news" },
    };
  },
});
const upload = multer({ storage });

function bucket() {
  const db = mongoose.connection?.db;
  if (!db) return null;
  return new mongoose.mongo.GridFSBucket(db, { bucketName: "news" });
}
function imgUrl(id) {
  return id ? `/api/files/news/${String(id)}` : "";
}
function idFromUrl(url = "") {
  return String(url).match(/^\/api\/files\/news\/([a-f0-9]{24})$/i)?.[1] || null;
}

/* ---------- Routes ---------- */

// List (public)
router.get("/", async (_req, res) => {
  try {
    const news = await NewsItem.find({}).sort({ createdAt: -1 }).lean();
    const items = news.map((n) => ({
      id: String(n._id),
      title: n.title,
      link: n.link || "",
      image: n.image || "",
    }));
    res.json({ success: true, news: items });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Create (admin) — supports optional image
router.post("/", isAdmin, upload.single("image"), async (req, res) => {
  try {
    const { title, link = "" } = req.body || {};
    if (!title) return res.status(400).json({ success: false, error: "Title required" });

    const item = await NewsItem.create({
      title: String(title),
      link: String(link || ""),
      image: imgUrl(req.file?.id),
    });

    res.json({
      success: true,
      item: {
        id: String(item._id),
        title: item.title,
        link: item.link,
        image: item.image,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Delete (admin) — also removes GridFS file if present
router.delete("/:id", isAdmin, async (req, res) => {
  try {
    const doc = await NewsItem.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: "Not found" });

    const fid = idFromUrl(doc.image);
    if (fid) {
      const b = bucket();
      await b?.delete(new mongoose.Types.ObjectId(fid)).catch(() => {});
    }
    res.json({ success: true, removed: String(doc._id) });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Local error handler
router.use((err, _req, res, _next) => {
  console.error("News route error:", err);
  res.status(err.status || 500).json({ success: false, message: err.message || "Server error" });
});

export default router;
