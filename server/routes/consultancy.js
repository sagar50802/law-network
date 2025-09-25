// server/routes/consultancy.js
import express from "express";
import multer from "multer";
import { GridFsStorage } from "multer-gridfs-storage";
import mongoose from "mongoose";
import { isAdmin } from "./utils.js";

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
        image: { type: String, required: true }, // /api/files/<id>
        order: { type: Number, default: 0 },
      },
      { timestamps: true }
    )
  );

/* ---------- GridFS upload ---------- */
const storage = new GridFsStorage({
  url: process.env.MONGO_URI,
  file: (_req, file) => ({
    filename: Date.now() + "-" + file.originalname.replace(/\s+/g, "_"),
    bucketName: "uploads",
    metadata: { folder: "consultancy", mime: file.mimetype, original: file.originalname },
  }),
});
const upload = multer({ storage });

function fileUrlFromReq(req) {
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
    const items = await Consultancy.find({}).sort({ order: 1, createdAt: -1 });
    res.json({ success: true, items });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Create (admin)
router.post("/", isAdmin, upload.single("image"), async (req, res) => {
  try {
    const { title, subtitle, intro, order } = req.body;
    if (!title) return res.status(400).json({ success: false, error: "Title required" });
    if (!req.file) return res.status(400).json({ success: false, error: "Image required" });

    const doc = await Consultancy.create({
      title,
      subtitle: subtitle || "",
      intro: intro || "",
      order: Number(order || 0),
      image: fileUrlFromReq(req),
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
    const patch = {
      ...(req.body.title != null ? { title: req.body.title } : {}),
      ...(req.body.subtitle != null ? { subtitle: req.body.subtitle } : {}),
      ...(req.body.intro != null ? { intro: req.body.intro } : {}),
      ...(req.body.order != null ? { order: Number(req.body.order) } : {}),
    };

    if (req.file) {
      const prev = await Consultancy.findById(id).lean();
      const oldId = extractIdFromUrl(prev?.image);
      if (oldId) {
        try { await gridBucket()?.delete(new mongoose.Types.ObjectId(oldId)); } catch {}
      }
      patch.image = fileUrlFromReq(req);
    }

    const updated = await Consultancy.findByIdAndUpdate(id, patch, { new: true });
    if (!updated) return res.status(404).json({ success: false, error: "Not found" });
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

    const oldId = extractIdFromUrl(doc?.image);
    if (oldId) {
      try { await gridBucket()?.delete(new mongoose.Types.ObjectId(oldId)); } catch {}
    }

    res.json({ success: true, removed: doc });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/* ---------- Error handler ---------- */
router.use((err, _req, res, _next) => {
  console.error("Consultancy route error:", err);
  res.status(err.status || 500).json({ success: false, message: err.message || "Server error" });
});

export default router;
