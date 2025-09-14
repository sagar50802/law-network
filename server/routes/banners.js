const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { ensureDir, readJSON, writeJSON, isAdmin } = require("./utils");

const router = express.Router();

const DATA_FILE = path.join(__dirname, "..", "data", "banners.json");
const UP_DIR = path.join(__dirname, "..", "uploads", "banners");
ensureDir(UP_DIR);
if (!fs.existsSync(DATA_FILE)) writeJSON(DATA_FILE, []);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UP_DIR),
  filename: (_req, file, cb) => cb(null, `${Date.now()}${path.extname(file.originalname || "")}`),
});
const upload = multer({ storage });

router.get("/", (_req, res) => {
  res.json({ success: true, banners: readJSON(DATA_FILE, []) });
});

router.post("/", isAdmin, upload.single("file"), (req, res) => {
  const items = readJSON(DATA_FILE, []);
  const { title = "Untitled", link = "", url = "", type } = req.body;

  const item = {
    id: String(Date.now()),
    title,
    link,
    type: type || (req.file && req.file.mimetype.startsWith("video") ? "video" : "image"),
    url: req.file ? `/uploads/banners/${req.file.filename}` : url,
    createdAt: Date.now(),
  };
  items.unshift(item);
  writeJSON(DATA_FILE, items);
  res.json({ success: true, item });
});

router.delete("/:id", isAdmin, (req, res) => {
  const items = readJSON(DATA_FILE, []);
  const idx = items.findIndex(i => i.id === req.params.id || i._id === req.params.id);
  if (idx === -1) return res.status(404).json({ success:false, message:"Not found" });
  const [removed] = items.splice(idx, 1);
  writeJSON(DATA_FILE, items);
  if (removed.url && removed.url.startsWith("/uploads/")) {
    try { fs.unlinkSync(path.join(__dirname, "..", removed.url.replace(/^\//, ""))); } catch {}
  }
  res.json({ success: true });
});

module.exports = router;
