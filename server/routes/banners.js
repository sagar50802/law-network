// server/routes/banners.js
import express from "express";
import path from "path";
import fs from "fs";
import fsp from "fs/promises";
import multer from "multer";
import { fileURLToPath } from "url";
import { ensureDir, readJSON, writeJSON, isAdmin } from "./utils.js";

const router = express.Router();

// ── ESM __dirname ────────────────────────────────────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Storage locations ───────────────────────────────────────────────────────
const DATA_FILE = path.join(__dirname, "..", "data", "banners.json");
const UP_DIR = path.join(__dirname, "..", "uploads", "banners");
ensureDir(path.dirname(DATA_FILE));
ensureDir(UP_DIR);
if (!fs.existsSync(DATA_FILE)) writeJSON(DATA_FILE, []);

// ── Multer setup ────────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UP_DIR),
  filename: (_req, file, cb) =>
    cb(null, `${Date.now()}-${file.originalname.replace(/\s+/g, "_")}`),
});
const upload = multer({ storage });

/* ------------------------------- Routes ---------------------------------- */

// List (public)
router.get("/", (_req, res) => {
  res.json({ success: true, banners: readJSON(DATA_FILE, []) });
});

// Create (admin)  — expects FormData with field name "file"
router.post("/", isAdmin, upload.single("file"), (req, res) => {
  try {
    const list = readJSON(DATA_FILE, []);
    const { title = "", type = "image" } = req.body;

    const item = {
      id: Date.now().toString(),
      title,
      type, // "image" | "video" (front-end can ignore if not used)
      url: req.file ? "/uploads/banners/" + req.file.filename : "",
    };

    list.push(item);
    writeJSON(DATA_FILE, list);
    res.json({ success: true, item });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Delete (admin)
router.delete("/:id", isAdmin, async (req, res) => {
  try {
    const list = readJSON(DATA_FILE, []);
    const idx = list.findIndex((b) => b.id === req.params.id);
    if (idx < 0) return res.status(404).json({ success: false, error: "Not found" });

    const [removed] = list.splice(idx, 1);
    writeJSON(DATA_FILE, list);

    if (removed.url?.startsWith("/uploads/banners/")) {
      const abs = path.join(__dirname, "..", removed.url.replace(/^\//, ""));
      const safeRoot = path.join(__dirname, "..", "uploads", "banners");
      if (abs.startsWith(safeRoot)) await fsp.unlink(abs).catch(() => {});
    }

    res.json({ success: true, removed });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* --------------------------- Error handler -------------------------------- */
router.use((err, _req, res, _next) => {
  console.error("Banners route error:", err);
  res
    .status(err.status || 500)
    .json({ success: false, message: err.message || "Server error" });
});

export default router;
