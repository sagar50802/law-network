// server/routes/consultancy.js
import express from "express";
import multer from "multer";
import { GridFsStorage } from "multer-gridfs-storage";
import mongoose from "mongoose";
import { createRequire } from "module";
const requireCjs = createRequire(import.meta.url);
const { isAdmin } = requireCjs("./utils.js");

const router = express.Router();

/* ---------- Model ---------- */
const Consultancy =
  mongoose.models.Consultancy ||
  mongoose.model(
    "Consultancy",
    new mongoose.Schema(
      {
        title: { type: String, required: true },
        subtitle: { type: String, default: "" },
        intro: { type: String, default: "" },
        image: { type: String, required: true }, // /api/files/consultancy/<id>
        order: { type: Number, default: 0 },
      },
      { timestamps: true }
    )
  );

/* ---------- GridFS storage (bucket: consultancy) ---------- */
const storage = new GridFsStorage({
  url: process.env.MONGO_URI,
  file: (_req, file) => {
    const safe = (file.originalname || "file").replace(/\s+/g, "_").replace(/[^\w.\-]/g, "");
    return {
      filename: `${Date.now()}-${safe}`,
      bucketName: "consultancy",
      metadata: { mime: file.mimetype || "application/octet-stream", bucket: "consultancy" },
    };
  },
});
const upload = multer({ storage });

const fileUrl = (id) => (id ? `/api/files/consultancy/${String(id)}` : "");
const idFromUrl = (url = "") => (String(url).match(/^\/api\/files\/consultancy\/([a-f0-9]{24})$/i)?.[1] || null);
const deleteFile = async (id) => {
  if (!id || !mongoose.connection?.db) return;
  const b = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "consultancy" });
  await b.delete(new mongoose.Types.ObjectId(id)).catch(() => {});
};

/* ---------- Routes ---------- */

// List (public)
router.get("/", async (_req, res) => {
  try {
    const items = await Consultancy.find({}).sort({ order: 1, createdAt: -1 }).lean();
    res.json({ success: true, items });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Create (admin)
router.post("/", isAdmin, upload.single("image"), async (req, res) => {
  try {
    const { title, subtitle = "", intro = "", order = 0 } = req.body;
    if (!title) return res.status(400).json({ success: false, error: "Title required" });
    if (!req.file) return res.status(400).json({ success: false, error: "Image required" });

    const item = await Consultancy.create({
      title,
      subtitle,
      intro,
      order: Number(order || 0),
      image: fileUrl(req.file.id),
    });

    res.json({ success: true, item });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Update (admin)
router.patch("/:id", isAdmin, upload.single("image"), async (req, res) => {
  try {
    const prev = await Consultancy.findById(req.params.id);
    if (!prev) return res.status(404).json({ success: false, error: "Not found" });

    const patch = {
      ...(req.body.title != null ? { title: req.body.title } : {}),
      ...(req.body.subtitle != null ? { subtitle: req.body.subtitle } : {}),
      ...(req.body.intro != null ? { intro: req.body.intro } : {}),
      ...(req.body.order != null ? { order: Number(req.body.order) } : {}),
    };

    if (req.file) {
      const oldId = idFromUrl(prev.image);
      if (oldId) await deleteFile(oldId);
      patch.image = fileUrl(req.file.id);
    }

    const updated = await Consultancy.findByIdAndUpdate(req.params.id, patch, { new: true });
    res.json({ success: true, item: updated });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Delete (admin)
router.delete("/:id", isAdmin, async (req, res) => {
  try {
    const doc = await Consultancy.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: "Not found" });

    const fid = idFromUrl(doc.image);
    if (fid) await deleteFile(fid);

    res.json({ success: true, removed: doc });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Error handler
router.use((err, _req, res, _next) => {
  console.error("Consultancy route error:", err);
  res.status(err.status || 500).json({ success: false, message: err.message || "Server error" });
});

export default router;
