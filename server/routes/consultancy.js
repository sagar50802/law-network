// server/routes/consultancy.js
import express from "express";
import path from "path";
import fsp from "fs/promises";
import multer from "multer";
import { fileURLToPath } from "url";
import { isAdmin, ensureDir } from "./utils.js";
import Consultancy from "../models/Consultancy.js";

const router = express.Router();

// ESM __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ---------- Upload setup ---------- */
const UP_DIR = path.join(__dirname, "..", "uploads", "consultancy");
ensureDir(UP_DIR);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UP_DIR),
  filename: (_req, file, cb) => {
    const safe = Date.now() + "-" + file.originalname.replace(/\s+/g, "_");
    cb(null, safe);
  },
});
const upload = multer({ storage });

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

    const rel = "/uploads/consultancy/" + req.file.filename;
    const doc = await Consultancy.create({
      title,
      subtitle: subtitle || "",
      intro: intro || "",
      order: Number(order || 0),
      image: rel,
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
    if (req.file) patch.image = "/uploads/consultancy/" + req.file.filename;

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
    const { id } = req.params;
    const doc = await Consultancy.findByIdAndDelete(id);
    if (!doc) return res.status(404).json({ success: false, error: "Not found" });

    if (doc.image?.startsWith("/uploads/consultancy/")) {
      const abs = path.join(__dirname, "..", doc.image.replace(/^\//, ""));
      const safeRoot = path.join(__dirname, "..", "uploads", "consultancy");
      if (abs.startsWith(safeRoot)) await fsp.unlink(abs).catch(() => {});
    }

    res.json({ success: true, removed: doc });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/* ---------- Error handler ---------- */
router.use((err, _req, res, _next) => {
  console.error("Consultancy route error:", err);
  res
    .status(err.status || 500)
    .json({ success: false, message: err.message || "Server error" });
});

export default router;
