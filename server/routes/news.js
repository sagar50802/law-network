// server/routes/news.js
const express = require("express");
const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");
const multer = require("multer");
const mongoose = require("mongoose");
const { isAdmin } = require("./utils");

const router = express.Router();

/* ----------------------- Model ----------------------- */
const News = mongoose.model(
  "News",
  new mongoose.Schema(
    {
      title: { type: String, required: true },
      link: { type: String, default: "" },
      image: { type: String, default: "" }, // "/uploads/news/filename.jpg"
      order: { type: Number, default: 0 },
      publishedAt: { type: Date, default: Date.now },
    },
    { timestamps: true }
  )
);

/* --------------------- Upload setup ------------------- */
const UP_DIR = path.join(__dirname, "..", "uploads", "news");
if (!fs.existsSync(UP_DIR)) fs.mkdirSync(UP_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UP_DIR),
  filename: (_req, file, cb) => {
    const safe = Date.now() + "-" + file.originalname.replace(/\s+/g, "_");
    cb(null, safe);
  },
});
const upload = multer({ storage });

/* ----------------- CORS setup ------------------------- */
const allowedOrigins = [
  "http://localhost:5173",
  "https://law-network-client.onrender.com",
  "https://law-network.onrender.com",
];
function setCors(res, originHeader) {
  const origin = allowedOrigins.includes(originHeader)
    ? originHeader
    : allowedOrigins[0];
  res.header("Access-Control-Allow-Origin", origin);
  res.header("Vary", "Origin");
  res.header("Access-Control-Allow-Credentials", "true");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Owner-Key, x-owner-key"
  );
  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS"
  );
  res.header("Cross-Origin-Resource-Policy", "cross-origin");
}
router.use((req, res, next) => {
  setCors(res, req.headers.origin);
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

/* ------------------------ GET list -------------------- */
router.get("/", async (_req, res) => {
  try {
    const docs = await News.find({}).sort({ order: 1, createdAt: -1 });
    const news = docs.map((d) => ({
      id: d._id.toString(),
      title: d.title,
      link: d.link,
      image: d.image,
      order: d.order,
      createdAt: d.createdAt,
      publishedAt: d.publishedAt,
    }));
    res.json({ success: true, news });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/* ------------------------ CREATE ---------------------- */
router.post("/", isAdmin, upload.single("image"), async (req, res) => {
  try {
    const { title, link, order } = req.body;
    if (!title)
      return res.status(400).json({ success: false, error: "Title required" });

    const relImage = req.file ? "/uploads/news/" + req.file.filename : "";
    const doc = await News.create({
      title: title.trim(),
      link: (link || "").trim(),
      image: relImage,
      order: Number(order || 0),
    });

    res.json({
      success: true,
      item: {
        id: doc._id.toString(),
        title: doc.title,
        link: doc.link,
        image: doc.image,
        order: doc.order,
        createdAt: doc.createdAt,
        publishedAt: doc.publishedAt,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/* --------------------- UPDATE (PATCH) ----------------- */
router.patch("/:id", isAdmin, upload.single("image"), async (req, res) => {
  try {
    const { id } = req.params;
    const patch = {};
    if (req.body.title != null) patch.title = String(req.body.title).trim();
    if (req.body.link != null) patch.link = String(req.body.link).trim();
    if (req.body.order != null) patch.order = Number(req.body.order);
    if (req.file) patch.image = "/uploads/news/" + req.file.filename;

    const updated = await News.findByIdAndUpdate(id, patch, { new: true });
    if (!updated)
      return res.status(404).json({ success: false, error: "Not found" });

    res.json({
      success: true,
      item: {
        id: updated._id.toString(),
        title: updated.title,
        link: updated.link,
        image: updated.image,
        order: updated.order,
        createdAt: updated.createdAt,
        publishedAt: updated.publishedAt,
      },
    });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/* ----------------------- DELETE ----------------------- */
router.delete("/:id", isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await News.findByIdAndDelete(id);
    if (!doc)
      return res.status(404).json({ success: false, error: "Not found" });

    if (doc.image && doc.image.startsWith("/uploads/news/")) {
      const abs = path.join(__dirname, "..", doc.image.replace(/^\//, ""));
      const safeRoot = path.join(__dirname, "..", "uploads", "news");
      if (abs.startsWith(safeRoot)) {
        await fsp.unlink(abs).catch(() => {});
      }
    }

    res.json({ success: true, removed: doc });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/* ------------------- Error handler -------------------- */
router.use((err, req, res, _next) => {
  setCors(res, req.headers.origin);
  console.error("News route error:", err);
  res
    .status(err.status || 500)
    .json({ success: false, message: err.message || "Server error" });
});

module.exports = router;
