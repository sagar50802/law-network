// server/routes/news.js (ESM)
import express from "express";
import multer from "multer";
import mongoose from "mongoose";
import { isAdmin } from "./utils.js";

const router = express.Router();

/* --------- model (tiny, in-process) --------- */
const News =
  mongoose.models.News ||
  mongoose.model(
    "News",
    new mongoose.Schema(
      {
        title: { type: String, required: true },
        link: { type: String, default: "" },
        image: { type: String, default: "" }, // e.g. "/api/files/news/<id>"
      },
      { timestamps: true }
    )
  );

/* --------- helpers --------- */
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
const idFromUrl = (url = "", bucket = "news") =>
  String(url).match(new RegExp(`^/api/files/${bucket}/([a-f0-9]{24})$`, "i"))?.[1] || null;

/* --------- multer (GridFS: news) --------- */
const storage = await makeStorage("news");
const upload = multer({ storage });

/* --------- routes --------- */

// List
router.get("/", async (_req, res) => {
  try {
    const docs = await News.find({}).sort({ createdAt: -1 }).lean();
    const news = docs.map((d) => ({
      id: String(d._id),
      title: d.title,
      link: d.link || "",
      image: d.image || "", // front-end will absUrl() this
    }));
    res.json({ success: true, news });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Create (admin)
router.post("/", isAdmin, upload.single("image"), async (req, res) => {
  try {
    const { title = "", link = "" } = req.body || {};
    if (!title.trim()) return res.status(400).json({ success: false, error: "Title required" });

    const image = req.file ? idUrl("news", req.file.id) : "";
    const doc = await News.create({ title: title.trim(), link: link.trim(), image });
    res.json({
      success: true,
      item: {
        id: String(doc._id),
        title: doc.title,
        link: doc.link || "",
        image: doc.image || "",
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

    const fid = idFromUrl(doc.image, "news");
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
