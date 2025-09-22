// server/routes/gridfs.js
const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const { GridFsStorage } = require("multer-gridfs-storage");
const { ObjectId } = require("mongodb");

const router = express.Router();
const mongoURI = process.env.MONGO_URI;

// ---------- Allowed origins (must match server.js) ----------
const allowedOrigins = [
  "http://localhost:5173",
  "https://law-network-client.onrender.com",
  "https://law-network.onrender.com",
];

// ---------- CORS helper ----------
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

// ---------- GridFS Storage ----------
const storage = new GridFsStorage({
  url: mongoURI,
  file: (req, file) => {
    if (!file.mimetype || !file.mimetype.includes("pdf")) {
      return Promise.reject(new Error("Only PDF files allowed"));
    }
    return {
      _id: new ObjectId(),
      filename: `${Date.now()}-${(file.originalname || "file.pdf").replace(
        /\s+/g,
        "_"
      )}`,
      bucketName: "pdfs",
    };
  },
});

const upload = multer({ storage });

// ---------- Upload (manual/demo) ----------
router.post("/pdf/upload", (req, res, next) => {
  upload.single("file")(req, res, (err) => {
    if (err) {
      setCors(res, req.headers.origin);
      console.error("GridFS upload error:", err);
      return res
        .status(400)
        .json({ success: false, message: err.message || "Upload error" });
    }
    if (!req.file)
      return res.status(400).json({ success: false, message: "No PDF uploaded" });

    res.json({
      success: true,
      fileId: req.file.id,
      filename: req.file.filename,
      url: `/api/gridfs/pdf/${req.file.filename}`,
    });
  });
});

// ---------- Stream by filename ----------
router.get("/pdf/:filename", async (req, res) => {
  try {
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: "pdfs",
    });

    const stream = bucket.openDownloadStreamByName(req.params.filename);

    res.set("Content-Type", "application/pdf");
    res.set("Access-Control-Allow-Origin", "*"); // streaming safe for all origins
    stream.on("error", (err) => {
      console.error("GridFS stream error:", err);
      res.status(404).json({ success: false, message: "File not found" });
    });
    stream.pipe(res);
  } catch (err) {
    console.error("GridFS filename error:", err);
    res
      .status(500)
      .json({ success: false, message: err.message || "Server error" });
  }
});

// ---------- Stream by ID ----------
router.get("/pdf/id/:id", async (req, res) => {
  try {
    const fileId = new mongoose.Types.ObjectId(req.params.id);
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: "pdfs",
    });

    const stream = bucket.openDownloadStream(fileId);

    res.set("Content-Type", "application/pdf");
    res.set("Access-Control-Allow-Origin", "*");
    stream.on("error", (err) => {
      console.error("GridFS stream ID error:", err);
      res.status(404).json({ success: false, message: "File not found" });
    });
    stream.pipe(res);
  } catch (err) {
    console.error("GridFS ID error:", err);
    res
      .status(500)
      .json({ success: false, message: err.message || "Server error" });
  }
});

// ---------- Route-level error handler ----------
router.use((err, req, res, _next) => {
  setCors(res, req.headers.origin);
  console.error("GridFS route error:", err);
  res
    .status(err.status || 500)
    .json({ success: false, message: err.message || "Server error" });
});

module.exports = router;
