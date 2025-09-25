// server/routes/news.js  (ESM, matches NewsTicker.jsx)
import express from "express";
import multer from "multer";
import mongoose from "mongoose";
import { isAdmin } from "./utils.js";

const router = express.Router();

/* ---------------- Helpers ---------------- */
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
const idUrl = (bucket, id) => (id ? `/api/files/${bucket}/${String(id)}` : "");
function extractIdFromUrl(url = "", expectedBucket) {
  const m = String(url).match(/^\/api\/files\/([^/]+)\/([a-f0-9]{24})$/i);
  if (!m) return null;
  const [, b, id] = m;
  if (expectedBucket && b !== expectedBucket) return null;
  return id;
}

/* ---------------- Model ---------------- */
const NewsItem =
  mongoose.models.NewsItem ||
  mongoose.model(
    "NewsItem",
    new mongoose.Schema(
      {
        title: { type: String, required: true },
        link: { type: String, default: "" },
        image: { type: String, default: "" }, // stores /api/files/news/<id>
      },
      { timestamps: true }
    )
  );

/* ---------------- Multer (GridFS: news) ---------------- */
const storage = await makeStorage("news");
const upload = multer({ storage });

/* ---------------- Routes ---------------- */

// GET /api/news  -> { news: [...] }
router.get("/", async (_req, res) => {
  try {
    const docs = await NewsItem.find({}).sort({ createdAt: -1 }).lean();
    const news = docs.map((d) => ({
      id: d._id.toString(),
      title: d.title,
      link: d.link || "",
      image: d.image || "", // begins with "/" if present
    }));
    res.json({ success: true, news });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST /api/news  (FormData: title, link, image?)  [admin]
router.post("/", isAdmin, upload.single("image"), async (req, res) => {
  try {
    const { title, link = "" } = req.body || {};
    if (!title) return res.status(400).json({ success: false, error: "Title required" });

    const image = req.file ? idUrl("news", req.file.id) : "";

    const item = await NewsItem.create({ title, link, image });
    res.json({
      success: true,
      item: {
        id: item._id.toString(),
        title: item.title,
        link: item.link,
        image: item.image,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// DELETE /api/news/:id  [admin]
router.delete("/:id", isAdmin, async (req, res) => {
  try {
    const doc = await NewsItem.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: "Not found" });

    const oldId = extractIdFromUrl(doc.image, "news");
    if (oldId) {
      const b = grid("news");
      await b?.delete(new mongoose.Types.ObjectId(oldId)).catch(() => {});
    }

    res.json({ success: true, removed: { id: doc._id.toString() } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Safety net
router.use((err, _req, res, _next) => {
  console.error("News route error:", err);
  res.status(err.status || 500).json({ success: false, message: err.message || "Server error" });
});

export default router;
