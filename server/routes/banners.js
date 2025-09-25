// server/routes/banners.js
import express from "express";
import path from "path";
import fsp from "fs/promises";
import multer from "multer";
import { fileURLToPath } from "url";
import { isAdmin, ensureDir } from "./utils.js";
import Banner from "../models/Banner.js";

const router = express.Router();

// ESM __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Upload dir (served by /uploads static in server.js)
const UP_DIR = path.join(__dirname, "..", "uploads", "banners");
ensureDir(UP_DIR);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UP_DIR),
  filename: (_req, file, cb) =>
    cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, "_")}`),
});
const upload = multer({ storage });

/* ---------- Routes ---------- */

// List (public)
router.get("/", async (_req, res) => {
  try {
    const items = await Banner.find({}).sort({ createdAt: -1 });
    res.json({ success: true, items });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Create (admin) – accepts FormData field "file"; optional title, type
router.post("/", isAdmin, upload.single("file"), async (req, res) => {
  try {
    const { title = "", type = "image" } = req.body;
    const url =
      (req.file && `/uploads/banners/${req.file.filename}`) ||
      (req.body.url || "");

    if (!url) {
      return res.status(400).json({ success: false, error: "No file uploaded or url provided" });
    }

    const item = await Banner.create({ title, type, url });
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

    // remove file if it's ours
    if (doc.url?.startsWith("/uploads/banners/")) {
      const abs = path.join(__dirname, "..", doc.url.replace(/^\//, ""));
      const safeRoot = path.join(__dirname, "..", "uploads", "banners");
      if (abs.startsWith(safeRoot)) await fsp.unlink(abs).catch(() => {});
    }

    res.json({ success: true, removed: doc });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/* ---------- Error handler ---------- */
router.use((err, _req, res, _next) => {
  console.error("Banners route error:", err);
  res
    .status(err.status || 500)
    .json({ success: false, message: err.message || "Server error" });
});

export default router;
