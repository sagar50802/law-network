// server/routes/consultancy.js
const express = require("express");
const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");
const multer = require("multer");
const mongoose = require("mongoose");
const { isAdmin } = require("./utils");

const router = express.Router();

// Model
const Consultancy = mongoose.model(
  "Consultancy",
  new mongoose.Schema(
    {
      title: { type: String, required: true },
      subtitle: { type: String, default: "" },
      intro: { type: String, default: "" },
      image: { type: String, required: true }, // /uploads/consultancy/filename.jpg
      order: { type: Number, default: 0 },
    },
    { timestamps: true }
  )
);

// Uploads
const UP_DIR = path.join(__dirname, "..", "uploads", "consultancy");
if (!fs.existsSync(UP_DIR)) fs.mkdirSync(UP_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UP_DIR),
  filename: (_req, file, cb) => {
    const safe = Date.now() + "-" + file.originalname.replace(/\s+/g, "_");
    cb(null, safe);
  },
});
const upload = multer({ storage });

// ── Allowed origins (match server.js) ────────────────
const allowedOrigins = [
  "http://localhost:5173",
  "https://law-network-client.onrender.com",
  "https://law-network.onrender.com",
];
function setCors(res, originHeader) {
  const origin = allowedOrigins.includes(originHeader) ? originHeader : allowedOrigins[0];
  res.header("Access-Control-Allow-Origin", origin);
  res.header("Vary", "Origin");
  res.header("Access-Control-Allow-Credentials", "true");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Owner-Key, x-owner-key"
  );
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.header("Cross-Origin-Resource-Policy", "cross-origin");
}
router.use((req, res, next) => {
  setCors(res, req.headers.origin);
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ── Routes ───────────────────────────────

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
    if (!title)
      return res.status(400).json({ success: false, error: "Title required" });
    if (!req.file)
      return res.status(400).json({ success: false, error: "Image required" });

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
    if (req.file) {
      patch.image = "/uploads/consultancy/" + req.file.filename;
    }
    const updated = await Consultancy.findByIdAndUpdate(id, patch, { new: true });
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
    const doc = await Consultancy.findByIdAndDelete(id);
    if (!doc) return res.status(404).json({ success: false, error: "Not found" });

    if (doc.image && doc.image.startsWith("/uploads/consultancy/")) {
      const abs = path.join(__dirname, "..", doc.image.replace(/^\//, ""));
      const safeRoot = path.join(__dirname, "..", "uploads", "consultancy");
      if (abs.startsWith(safeRoot)) {
        await fsp.unlink(abs).catch(() => {});
      }
    }

    res.json({ success: true, removed: doc });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Error handler
router.use((err, req, res, _next) => {
  setCors(res, req.headers.origin);
  console.error("Consultancy route error:", err);
  res.status(err.status || 500).json({ success: false, message: err.message || "Server error" });
});

module.exports = router;
