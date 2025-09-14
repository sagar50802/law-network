// server/routes/news.js
const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const mongoose = require("mongoose");

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

/* -------------------- Admin guard --------------------- */
function assertOwner(req, res, next) {
  const key = req.headers["x-owner-key"] || req.headers["x-owner-key".toLowerCase()];
  if (!key || key !== req.ADMIN_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }
  next();
}

/* ------------------------ GET list -------------------- */
router.get("/", async (_req, res) => {
  try {
    const docs = await News.find({}).sort({ order: 1, createdAt: -1 });
    // shape to match your client expectation (id + image path for <img src={`${API_BASE}${n.image}`}>)
    const news = docs.map((d) => ({
      id: d._id.toString(),
      title: d.title,
      link: d.link,
      image: d.image, // e.g. "/uploads/news/xxx.jpg"
      order: d.order,
      createdAt: d.createdAt,
      publishedAt: d.publishedAt,
    }));
    res.json({ news });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ------------------------ CREATE ---------------------- */
router.post("/", assertOwner, upload.single("image"), async (req, res) => {
  try {
    const { title, link, order } = req.body;
    if (!title) return res.status(400).json({ error: "Title required" });

    const relImage = req.file ? "/uploads/news/" + req.file.filename : "";
    const doc = await News.create({
      title: title.trim(),
      link: (link || "").trim(),
      image: relImage,
      order: Number(order || 0),
    });

    res.json({
      ok: true,
      item: {
        id: doc._id.toString(),
        title: doc.title,
        link: doc.link,
        image: doc.image,
        order: doc.order,
        createdAt: doc.createdAt,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* --------------------- UPDATE (PATCH) ----------------- */
router.patch("/:id", assertOwner, upload.single("image"), async (req, res) => {
  try {
    const { id } = req.params;
    const patch = {};
    if (req.body.title != null) patch.title = String(req.body.title).trim();
    if (req.body.link != null) patch.link = String(req.body.link).trim();
    if (req.body.order != null) patch.order = Number(req.body.order);

    if (req.file) {
      patch.image = "/uploads/news/" + req.file.filename;
    }

    const updated = await News.findByIdAndUpdate(id, patch, { new: true });
    if (!updated) return res.status(404).json({ error: "Not found" });

    res.json({
      ok: true,
      item: {
        id: updated._id.toString(),
        title: updated.title,
        link: updated.link,
        image: updated.image,
        order: updated.order,
        createdAt: updated.createdAt,
      },
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

/* ----------------------- DELETE ----------------------- */
router.delete("/:id", assertOwner, async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await News.findByIdAndDelete(id);
    if (!doc) return res.status(404).json({ error: "Not found" });

    // (optional) try remove the file from disk
    if (doc.image && doc.image.startsWith("/uploads/news/")) {
      const abs = path.join(__dirname, "..", doc.image);
      fs.promises.unlink(abs).catch(() => {}); // ignore if already gone
    }

    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

module.exports = router;
