// server/routes/banners.js
import express from "express";
import multer from "multer";
import { GridFsStorage } from "multer-gridfs-storage";
import mongoose from "mongoose";
import { createRequire } from "module";

const requireCjs = createRequire(import.meta.url);
const { isAdmin } = requireCjs("./utils.js");

// Model (use your existing schema if present, else create once)
import mongoosePkg from "mongoose";
const Banner =
  mongoosePkg.models.Banner ||
  mongoosePkg.model(
    "Banner",
    new mongoosePkg.Schema(
      {
        title: { type: String, default: "" },
        type: { type: String, enum: ["image", "video"], required: true },
        url:  { type: String, required: true }, // '/api/files/banners/<id>' or external
        link: { type: String, default: "" },
      },
      { timestamps: true }
    )
  );

const router = express.Router();

/* ---------- GridFS storage (bucket: banners) ---------- */
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

const fileUrl = (id) => (id ? `/api/files/banners/${String(id)}` : "");
const idFromUrl = (url = "") => (String(url).match(/^\/api\/files\/banners\/([a-f0-9]{24})$/i)?.[1] || null);
const deleteFile = async (id) => {
  if (!id || !mongoose.connection?.db) return;
  const b = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "banners" });
  await b.delete(new mongoose.Types.ObjectId(id)).catch(() => {});
};

/* ---------- Routes ---------- */

// List (public)
router.get("/", async (_req, res) => {
  try {
    const banners = await Banner.find({}).sort({ createdAt: -1 }).lean();
    res.json({ success: true, banners });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Create (admin) – supports file or just an external URL
router.post("/", isAdmin, upload.single("file"), async (req, res) => {
  try {
    const { title = "", link = "", url = "" } = req.body;
    let storedUrl = url;
    let type = "image";

    if (req.file) {
      storedUrl = fileUrl(req.file.id);
      type = (req.file.mimetype || "").startsWith("video") ? "video" : "image";
    } else if (!storedUrl) {
      return res.status(400).json({ success: false, error: "No file or url" });
    }

    const item = await Banner.create({ title, link, url: storedUrl, type });
    res.json({ success: true, item });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Delete (admin)
router.delete("/:id", isAdmin, async (req, res) => {
  try {
    const doc = await Banner.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: "Not found" });

    const fid = idFromUrl(doc.url);
    if (fid) await deleteFile(fid);

    res.json({ success: true, removed: doc });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Error handler
router.use((err, _req, res, _next) => {
  console.error("Banners route error:", err);
  res.status(err.status || 500).json({ success: false, message: err.message || "Server error" });
});

export default router;
