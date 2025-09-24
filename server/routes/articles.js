// server/routes/articles.js
import express from "express";
import path from "path";
import fsp from "fs/promises";
import multer from "multer";
import { isAdmin, ensureDir } from "./utils.js";
import Article from "../models/Article.js";

const router = express.Router();

/* ---------- Upload setup ---------- */
const UP_DIR = path.join(process.cwd(), "server", "uploads", "articles");
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
      return res
        .status(400)
        .json({ success: false, error: "Title & content required" });
    }

    const rel = req.file ? "/uploads/articles/" + req.file.filename : "";
    const doc = await Article.create({
      title,
      content,
      link: link || "",
      allowHtml: allowHtml === "true",
      isFree: isFree === "true",
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
    const patch = { ...req.body };
    if (req.file) {
      patch.image = "/uploads/articles/" + req.file.filename;
    }

    const updated = await Article.findByIdAndUpdate(id, patch, { new: true });
    if (!updated)
      return res.status(404).json({ success: false, error: "Not found" });

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
    if (!doc)
      return res.status(404).json({ success: false, error: "Not found" });

    if (doc.image?.startsWith("/uploads/articles/")) {
      const abs = path.join(process.cwd(), "server", doc.image.replace(/^\//, ""));
      const safeRoot = path.join(process.cwd(), "server", "uploads", "articles");
      if (abs.startsWith(safeRoot)) await fsp.unlink(abs).catch(() => {});
    }

    res.json({ success: true, removed: doc });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/* ---------- Error handler ---------- */
router.use((err, _req, res, _next) => {
  console.error("Articles route error:", err);
  res
    .status(err.status || 500)
    .json({ success: false, message: err.message || "Server error" });
});

export default router;
