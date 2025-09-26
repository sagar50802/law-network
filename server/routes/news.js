import express from "express";
import multer from "multer";
import mongoose from "mongoose";
import { Readable } from "stream";

import { isAdmin } from "./utils.js";
import * as NewsModel from "../models/NewsItem.js";
const News = NewsModel.default || NewsModel;

const router = express.Router();

/* ------------ helpers ------------- */
function bucket(name) {
  const db = mongoose.connection?.db;
  if (!db) return null;
  return new mongoose.mongo.GridFSBucket(db, { bucketName: name });
}
function sanitize(name = "file") {
  return String(name).replace(/\s+/g, "_").replace(/[^\w.\-]/g, "");
}
function fileUrl(bucketName, id) {
  return id ? `/api/files/${bucketName}/${String(id)}` : "";
}
function extractGridId(url = "", expectedBucket = "news") {
  const m = String(url).match(/^\/api\/files\/([^/]+)\/([a-f0-9]{24})$/i);
  if (!m) return null;
  const [, b, id] = m;
  return b === expectedBucket ? id : null;
}

/* ------------ multer (memory) ------------- */
// Using memory storage avoids the plugin crash path. We stream into GridFS ourselves.
const mem = multer({ storage: multer.memoryStorage() });

/* ------------ routes ------------- */

// GET list (public)
router.get("/", async (_req, res) => {
  try {
    const rows = await News.find({}).sort({ createdAt: -1 }).lean();
    res.json({
      success: true,
      news: rows.map((d) => ({
        id: String(d._id),
        title: d.title || "",
        link: d.link || "",
        image: d.image || "",
        createdAt: d.createdAt,
      })),
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// POST create (admin) — image optional
router.post("/", isAdmin, mem.single("image"), async (req, res) => {
  try {
    const title = String(req.body?.title || "").trim();
    const link = String(req.body?.link || "").trim();
    if (!title) return res.status(400).json({ success: false, error: "Title required" });

    let image = "";
    if (req.file && req.file.buffer && req.file.buffer.length > 0) {
      const b = bucket("news");
      if (!b) return res.status(503).json({ success: false, error: "DB not connected" });

      const upload = b.openUploadStream(sanitize(req.file.originalname || "image"), {
        contentType: req.file.mimetype || "application/octet-stream",
        metadata: { mime: req.file.mimetype || "application/octet-stream" },
      });

      await new Promise((resolve, reject) => {
        Readable.from(req.file.buffer).pipe(upload)
          .on("error", reject)
          .on("finish", resolve);
      });

      image = fileUrl("news", upload.id);
    }

    const doc = await News.create({ title, link, image });
    res.json({
      success: true,
      item: { id: String(doc._id), title: doc.title, link: doc.link, image: doc.image, createdAt: doc.createdAt },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// DELETE (admin) — also delete GridFS image if present
router.delete("/:id", isAdmin, async (req, res) => {
  try {
    const doc = await News.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: "Not found" });

    const gid = extractGridId(doc.image, "news");
    if (gid) {
      const b = bucket("news");
      await b?.delete(new mongoose.Types.ObjectId(gid)).catch(() => {});
    }
    res.json({ success: true, removed: { id: String(doc._id) } });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Safety net for any unexpected errors inside this router
router.use((err, _req, res, _next) => {
  console.error("News route error:", err);
  res.status(err.status || 500).json({ success: false, message: err.message || "Server error" });
});

export default router;
