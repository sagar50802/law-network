// server/routes/banners.js (ESM)
import express from "express";
import path from "path";
import fs from "fs";
import fsp from "fs/promises";
import multer from "multer";
import { fileURLToPath } from "url";
import { ensureDir, readJSON, writeJSON, isAdmin } from "./utils.js";

const router = express.Router();

// ESM __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ---------- Storage & data file ---------- */
const DATA_FILE = path.join(__dirname, "..", "data", "banners.json");
ensureDir(path.dirname(DATA_FILE));
if (!fs.existsSync(DATA_FILE)) writeJSON(DATA_FILE, []);

const UP_DIR = path.join(__dirname, "..", "uploads", "banners");
ensureDir(UP_DIR);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UP_DIR),
  filename: (_req, file, cb) => {
    const safe = Date.now() + "-" + file.originalname.replace(/\s+/g, "_");
    cb(null, safe);
  },
});
const upload = multer({ storage });

const normalizeList = (v) => (Array.isArray(v) ? v : []);

/* ---------- helpers ---------- */
function detectType(input = "") {
  if (/^video\//i.test(input)) return "video";
  if (/\.(mp4|webm|mov|m4v)(\?|$)/i.test(input)) return "video";
  return "image";
}

/* ---------- Routes ---------- */

// List (public)
router.get("/", (_req, res) => {
  try {
    const list = normalizeList(readJSON(DATA_FILE, []));
    res.json({ success: true, banners: list });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Create (admin) — supports file OR url
router.post("/", isAdmin, upload.single("file"), async (req, res) => {
  try {
    const urlFromBody = (req.body?.url || "").trim();
    if (!req.file && !urlFromBody) {
      return res
        .status(400)
        .json({ success: false, error: "Provide a file or a URL" });
    }

    const item = {
      id: Date.now().toString(),
      title: req.body?.title || "",
      link: req.body?.link || "",
      url: "",
      type: "image",
    };

    if (req.file) {
      item.url = "/uploads/banners/" + req.file.filename;
      item.type = detectType(req.file.mimetype);
    } else {
      item.url = urlFromBody;
      item.type = detectType(urlFromBody);
    }

    const list = normalizeList(readJSON(DATA_FILE, []));
    list.push(item);
    writeJSON(DATA_FILE, list);

    res.json({ success: true, item });
  } catch (err) {
    console.error("banner upload error:", err);
    res.status(500).json({ success: false, error: err.message || "Upload failed" });
  }
});

// Delete (admin)
router.delete("/:id", isAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const list = normalizeList(readJSON(DATA_FILE, []));
    const idx = list.findIndex((b) => (b.id || b._id) === id);
    if (idx < 0) return res.status(404).json({ success: false, error: "Not found" });

    const [removed] = list.splice(idx, 1);
    writeJSON(DATA_FILE, list);

    // Delete local file if owned by us
    if (removed?.url?.startsWith("/uploads/banners/")) {
      const abs = path.join(__dirname, "..", removed.url.replace(/^\//, ""));
      const safeRoot = path.join(__dirname, "..", "uploads", "banners");
      if (abs.startsWith(safeRoot)) {
        await fsp.unlink(abs).catch(() => {});
      }
    }

    res.json({ success: true, removed });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
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
