// server/routes/banners.js  (ESM)
import express from "express";
import multer from "multer";
import mongoose from "mongoose";

const router = express.Router();

/* ---------- helpers (safe) ---------- */
async function makeStorage(bucket) {
  const { GridFsStorage } = await import("multer-gridfs-storage");
  return new GridFsStorage({
    url: process.env.MONGO_URI,
    file: (req, file) => {
      const safe = (file.originalname || "file")
        .replace(/\s+/g, "_")
        .replace(/[^\w.\-]/g, "");
      return {
        filename: `${Date.now()}-${safe}`,
        bucketName: bucket,
        metadata: {
          mime: file.mimetype || "application/octet-stream",
          title: req.body?.title || "",
          link: req.body?.link || "",
        },
      };
    },
  });
}
function grid(bucket) {
  const db = mongoose.connection?.db;
  if (!db) return null;
  return new mongoose.mongo.GridFSBucket(db, { bucketName: bucket });
}

/* ---------- multer storage ---------- */
const storage = await makeStorage("banners");
const upload = multer({ storage });

/* ---------- routes ---------- */

// List all banners (from GridFS 'banners' bucket)
router.get("/", async (_req, res) => {
  try {
    const db = mongoose.connection?.db;
    if (!db) return res.status(503).json({ success: false, error: "DB not connected" });

    const files = await db
      .collection("banners.files")
      .find({})
      .sort({ uploadDate: -1 })
      .toArray();

    const banners = files.map((f) => ({
      id: f._id.toString(),
      url: `/api/files/banners/${f._id.toString()}`,
      type: f.metadata?.mime || f.contentType || "image/*",
      title: f.metadata?.title || "",
      link: f.metadata?.link || "",
    }));

    res.json({ success: true, banners });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Upload one banner (image/video)
router.post("/", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: "file required" });
    const item = {
      id: String(req.file.id),
      url: `/api/files/banners/${String(req.file.id)}`,
      type: req.file.mimetype || req.file.metadata?.mime || "image/*",
      title: req.body?.title || "",
      link: req.body?.link || "",
    };
    res.json({ success: true, item });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Delete by GridFS id
router.delete("/:id", async (req, res) => {
  try {
    const b = grid("banners");
    if (!b) return res.status(503).json({ success: false, error: "DB not connected" });
    await b.delete(new mongoose.Types.ObjectId(req.params.id));
    res.json({ success: true, removed: req.params.id });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/* ---------- error handler ---------- */
router.use((err, _req, res, _next) => {
  console.error("Banners route error:", err);
  res.status(err.status || 500).json({ success: false, message: err.message || "Server error" });
});

export default router;
