const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const { GridFsStorage } = require("multer-gridfs-storage");
const { ObjectId } = require("mongodb");

const router = express.Router();
const mongoURI = process.env.MONGO_URI;

// ── CORS ─────────────────────
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

// ── GridFS storage (bucket: pdfs) ─────────────────────────
const storage = new GridFsStorage({
  url: mongoURI,
  file: (_req, file) => {
    if (!file.mimetype || !file.mimetype.includes("pdf")) {
      return Promise.reject(new Error("Only PDF files allowed"));
    }
    return {
      _id: new ObjectId(),
      filename: `${Date.now()}-${(file.originalname || "file.pdf").replace(/\s+/g, "_")}`,
      bucketName: "pdfs",
    };
  },
});
storage.on("connection", () => console.log("✓ GridFS storage ready (pdfs) [gridfs.js]"));
storage.on("connectionFailed", (e) => console.error("✗ GridFS storage error [gridfs.js]:", e?.message));

const upload = multer({ storage });

// ── Upload demo (admin tool) ─────────────
router.post("/pdf/upload", (req, res, next) => {
  const mw = upload.fields([{ name: "pdf", maxCount: 1 }, { name: "file", maxCount: 1 }]);
  mw(req, res, (err) => {
    if (err) {
      console.error("Upload error (demo):", err);
      return res.status(400).json({ success: false, error: err.message });
    }
    const file = (req.files?.pdf?.[0] || req.files?.file?.[0]) || null;
    if (!file) return res.status(400).json({ success: false, error: "No PDF uploaded" });
    res.json({
      success: true,
      fileId: file.id,
      filename: file.filename,
      url: `/api/gridfs/pdf/${file.filename}`,
    });
  });
});

// ── Stream by filename ───────────────────
router.get("/pdf/:filename", async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) return res.status(503).json({ error: "Database not connected" });
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "pdfs" });
    const stream = bucket.openDownloadStreamByName(req.params.filename);
    res.set("Content-Type", "application/pdf");
    res.set("Access-Control-Allow-Origin", "*");
    stream.on("error", () => res.status(404).json({ error: "File not found" }));
    stream.pipe(res);
  } catch (err) {
    console.error("GridFS stream error:", err);
    res.status(500).json({ error: err.message });
  }
});

// ── Stream by ID ─────────────────────────
router.get("/pdf/id/:id", async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) return res.status(503).json({ error: "Database not connected" });
    const fileId = new mongoose.Types.ObjectId(req.params.id);
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "pdfs" });
    const stream = bucket.openDownloadStream(fileId);
    res.set("Content-Type", "application/pdf");
    res.set("Access-Control-Allow-Origin", "*");
    stream.on("error", () => res.status(404).json({ error: "File not found" }));
    stream.pipe(res);
  } catch (err) {
    console.error("GridFS stream error (by id):", err);
    res.status(500).json({ error: err.message });
  }
});

// error handler
router.use((err, req, res, _next) => {
  setCors(res, req.headers.origin);
  console.error("GridFS route error:", err);
  res.status(err.status || 500).json({ success: false, message: err.message || "Server error" });
});

module.exports = router;
