// server/routes/news.js (ESM)
import express from "express";
import multer from "multer";
import mongoose from "mongoose";
import { isAdmin } from "./utils.js";

const router = express.Router();

/* ---------- model (safe re-use) ---------- */
const NewsSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    link: { type: String, default: "" },
    image: { type: String, default: "" }, // /api/files/news/<id>
  },
  { timestamps: true }
);
const News = mongoose.models.News || mongoose.model("News", NewsSchema);

/* ---------- helpers ---------- */
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

/* ---------- multer storage ---------- */
const storage = await makeStorage("news");
const upload = multer({ storage });

/* ---------- routes ---------- */

// List (public)
router.get("/", async (_req, res) => {
  try {
    const items = await News.find({}).sort({ createdAt: -1 }).lean();
    // normalize id field
    const norm = items.map((i) => ({
      id: String(i._id),
      title: i.title,
      link: i.link || "",
      image: i.image || "",
      createdAt: i.createdAt,
    }));
    res.json({ success: true, items: norm });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Create (admin) – image optional
router.post("/", isAdmin, upload.single("image"), async (req, res) => {
  try {
    const { title, link = "" } = req.body;
    if (!title) return res.status(400).json({ success: false, error: "Title required" });

    const image = req.file ? idUrl("news", req.file.id) : "";
    const doc = await News.create({ title, link, image });
    res.json({
      success: true,
      item: { id: String(doc._id), title: doc.title, link: doc.link, image: doc.image },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Update (admin) – supports replacing image
router.patch("/:id", isAdmin, upload.single("image"), async (req, res) => {
  try {
    const { id } = req.params;
    const prev = await News.findById(id);
    if (!prev) return res.status(404).json({ success: false, error: "Not found" });

    const patch = {
      ...(req.body.title != null ? { title: req.body.title } : {}),
      ...(req.body.link != null ? { link: req.body.link } : {}),
    };

    if (req.file) {
      const oldId = extractIdFromUrl(prev.image, "news");
      if (oldId) {
        const b = grid("news");
        await b?.delete(new mongoose.Types.ObjectId(oldId)).catch(() => {});
      }
      patch.image = idUrl("news", req.file.id);
    }

    const updated = await News.findByIdAndUpdate(id, patch, { new: true });
    res.json({
      success: true,
      item: {
        id: String(updated._id),
        title: updated.title,
        link: updated.link,
        image: updated.image || "",
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Delete (admin)
router.delete("/:id", isAdmin, async (req, res) => {
  try {
    const doc = await News.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: "Not found" });

    const oldId = extractIdFromUrl(doc.image, "news");
    if (oldId) {
      const b = grid("news");
      await b?.delete(new mongoose.Types.ObjectId(oldId)).catch(() => {});
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
