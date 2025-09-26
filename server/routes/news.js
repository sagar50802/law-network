// server/routes/news.js  (ESM)
import express from "express";
import multer from "multer";
import mongoose from "mongoose";
import { isAdmin } from "./utils.js";

const router = express.Router();

/* ---------------- model ---------------- */
const NewsSchema = new mongoose.Schema(
  { title: String, link: String, image: String },
  { timestamps: true }
);
const News = mongoose.models.News || mongoose.model("News", NewsSchema);

/* ---------------- helpers ---------------- */
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
function safeName(name = "file") {
  return `${Date.now()}-${String(name).replace(/\s+/g, "_").replace(/[^\w.\-]/g, "")}`;
}
async function saveBufferToGridFS(bucketName, buffer, filename, mime) {
  const b = grid(bucketName);
  if (!b) throw new Error("DB not connected");
  const { Readable } = await import("stream");
  return await new Promise((resolve, reject) => {
    const stream = new Readable({ read() { this.push(buffer); this.push(null); } });
    const up = b.openUploadStream(filename, { contentType: mime || "application/octet-stream", metadata: { mime } });
    up.once("finish", () => resolve(up.id));
    up.once("error", reject);
    stream.pipe(up);
  });
}

/* ---------------- multer (memory) ---------------- */
const upload = multer({ storage: multer.memoryStorage() });

/* ---------------- routes ---------------- */

// List (public)
router.get("/", async (_req, res) => {
  try {
    const items = await News.find({}).sort({ createdAt: -1 }).lean();
    res.json({ success: true, items: items.map(n => ({ id: n._id, ...n })) });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Create (admin)
router.post("/", isAdmin, upload.single("image"), async (req, res) => {
  try {
    const { title = "", link = "" } = req.body;
    if (!title.trim()) return res.status(400).json({ success: false, error: "Title required" });

    let image = "";
    if (req.file && req.file.buffer?.length) {
      const id = await saveBufferToGridFS("news", req.file.buffer, safeName(req.file.originalname), req.file.mimetype);
      image = idUrl("news", id);
    }

    const doc = await News.create({ title: title.trim(), link: link.trim(), image });
    res.json({ success: true, item: { id: doc._id, ...doc.toObject() } });
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
    res.json({ success: true, removed: { id: doc._id } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Error guard
router.use((err, _req, res, _next) => {
  console.error("News route error:", err);
  res.status(err.status || 500).json({ success: false, message: err.message || "Server error" });
});

export default router;
