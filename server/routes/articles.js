// server/routes/articles.js
import express from "express";
import multer from "multer";
import { GridFsStorage } from "multer-gridfs-storage";
import mongoose from "mongoose";
import { fileURLToPath } from "url";
import path from "path";
import fsp from "fs/promises";
import { isAdmin } from "./utils.js";
import Article from "../models/Article.js";

const router = express.Router();

// GridFS storage (single bucket "uploads")
const storage = new GridFsStorage({
  url: process.env.MONGO_URI,
  file: (_req, file) => ({
    filename: Date.now() + "-" + file.originalname.replace(/\s+/g, "_"),
    bucketName: "uploads",
    metadata: { folder: "articles", mime: file.mimetype, original: file.originalname },
  }),
});
const upload = multer({ storage });

/* ---------- helpers ---------- */
function fileUrlFromReq(req) {
  // multer-gridfs-storage puts GridFS file info on req.file
  const id = req?.file?.id?.toString?.();
  return id ? `/api/files/${id}` : "";
}
function gridBucket() {
  const db = mongoose.connection?.db;
  if (!db) return null;
  return new mongoose.mongo.GridFSBucket(db, { bucketName: "uploads" });
}
function extractIdFromUrl(url = "") {
  const m = String(url).match(/\/api\/files\/([a-f0-9]{24})/i);
  return m ? m[1] : null;
}

/* ---------- Routes ---------- */

// List (public)
router.get("/", async (_req, res) => {
  try {
    const items = await Article.find({}).sort({ createdAt: -1 });
    res.json({ success: true, items });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Create (admin)
router.post("/", isAdmin, upload.single("image"), async (req, res) => {
  try {
    const { title, content, link, allowHtml, isFree } = req.body;
    if (!title || !content) {
      return res.status(400).json({ success: false, error: "Title & content required" });
    }

    const doc = await Article.create({
      title,
      content,
      link: link || "",
      allowHtml: String(allowHtml) === "true",
      isFree: String(isFree) === "true",
      image: fileUrlFromReq(req), // ✅ GridFS-backed URL
    });

    res.json({ success: true, item: doc });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Update (admin)
router.patch("/:id", isAdmin, upload.single("image"), async (req, res) => {
  try {
    const { id } = req.params;
    const patch = { ...req.body };

    if (req.file) {
      // delete old grid file if there was one
      const prev = await Article.findById(id).lean();
      const oldId = extractIdFromUrl(prev?.image);
      if (oldId) {
        try {
          await gridBucket()?.delete(new mongoose.Types.ObjectId(oldId));
        } catch {}
      }
      patch.image = fileUrlFromReq(req);
    }

    const updated = await Article.findByIdAndUpdate(id, patch, { new: true });
    if (!updated) return res.status(404).json({ success: false, error: "Not found" });

    res.json({ success: true, item: updated });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Delete (admin)
router.delete("/:id", isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await Article.findByIdAndDelete(id);
    if (!doc) return res.status(404).json({ success: false, error: "Not found" });

    const oldId = extractIdFromUrl(doc?.image);
    if (oldId) {
      try {
        await gridBucket()?.delete(new mongoose.Types.ObjectId(oldId));
      } catch {}
    }

    res.json({ success: true, removed: doc });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Error handler
router.use((err, _req, res, _next) => {
  console.error("Articles route error:", err);
  res.status(err.status || 500).json({ success: false, message: err.message || "Server error" });
});

export default router;
