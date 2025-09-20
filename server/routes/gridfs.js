// server/routes/gridfs.js
const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const { GridFsStorage } = require("multer-gridfs-storage");
const { ObjectId } = require("mongodb");

const router = express.Router();
const mongoURI = process.env.MONGO_URI;

// 🔹 Match server.js allowed origins
const allowedOrigins = [
  "http://localhost:5173",
  "https://law-network-client.onrender.com",
  "https://law-network.onrender.com",
];

router.use((req, res, next) => {
  const origin = allowedOrigins.includes(req.headers.origin)
    ? req.headers.origin
    : allowedOrigins[0];
  res.header("Access-Control-Allow-Origin", origin);
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
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// ---------------- GridFS Storage ----------------
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

// ---------------- Upload (manual/demo) ----------------
router.post("/pdf/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No PDF uploaded" });
  res.json({
    success: true,
    fileId: req.file.id,
    filename: req.file.filename,
    url: `/api/gridfs/pdf/${req.file.filename}`,
  });
});

// ---------------- Stream by filename ----------------
router.get("/pdf/:filename", async (req, res) => {
  try {
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: "pdfs",
    });

    const stream = bucket.openDownloadStreamByName(req.params.filename);

    res.set("Content-Type", "application/pdf");
    res.set("Access-Control-Allow-Origin", "*"); // static streaming safe
    stream.on("error", () => res.status(404).json({ error: "File not found" }));
    stream.pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------- Stream by ID ----------------
router.get("/pdf/id/:id", async (req, res) => {
  try {
    const fileId = new mongoose.Types.ObjectId(req.params.id);
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: "pdfs",
    });

    const stream = bucket.openDownloadStream(fileId);

    res.set("Content-Type", "application/pdf");
    res.set("Access-Control-Allow-Origin", "*"); // static streaming safe
    stream.on("error", () => res.status(404).json({ error: "File not found" }));
    stream.pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
