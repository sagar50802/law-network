// server/routes/news.js  (ESM)
import express from "express";
import multer from "multer";
import mongoose from "mongoose";
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
        image: { type: String, default: "" }, // /api/files/news/<id>
      },
      { timestamps: true }
    )
  );

/* ---------- Helpers ---------- */
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
function idUrl(bucket, id) { return id ? `/api/files/${bucket}/${String(id)}` : ""; }
function extractIdFromUrl(url = "", expectedBucket) {
  const m = String(url).match(/^\/api\/files\/([^/]+)\/([a-f0-9]{24})$/i);
  if (!m) return null;
  const [, b, id] = m;
  if (expectedBucket && b !== expectedBucket) return null;
  return id;
}

/* ---------- Multer (bucket: news) ---------- */
const storage = await makeStorage("news");
const upload = multer({ storage });

/* ---------- Routes ---------- */

// List (public)
router.get("/", async (_req, res) => {
  try {
    const rows = await NewsItem.find({}).sort({ createdAt: -1 }).lean();
    const news = rows.map(r => ({
      id: String(r._id),
      title: r.title,
      link: r.link,
      image: r.image,
    }));
    res.json({ success: true, news });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Create (admin) with optional image
router.post("/", isAdmin, upload.single("image"), async (req, res) => {
  try {
    const { title = "", link = "" } = req.body || {};
    if (!title.trim()) return res.status(400).json({ success: false, error: "Title required" });

    const image = req.file ? idUrl("news", req.file.id) : "";
    const doc = await NewsItem.create({ title: title.trim(), link: link.trim(), image });

    res.json({
      success: true,
      item: { id: String(doc._id), title: doc.title, link: doc.link, image: doc.image },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Delete (admin)
router.delete("/:id", isAdmin, async (req, res) => {
  try {
    const doc = await NewsItem.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: "Not found" });

    const fid = extractIdFromUrl(doc.image, "news");
    if (fid) {
      const b = grid("news");
      await b?.delete(new mongoose.Types.ObjectId(fid)).catch(() => {});
    }
    res.json({ success: true, removed: String(doc._id) });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Error handler
router.use((err, _req, res, _next) => {
  console.error("News route error:", err);
  res.status(err.status || 500).json({ success: false, message: err.message || "Server error" });
});

export default router;
