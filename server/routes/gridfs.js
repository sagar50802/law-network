// routes/gridfs.js
const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const { GridFsStorage } = require("multer-gridfs-storage");
const { GridFSBucket } = require("mongodb");

const router = express.Router();

// Use Mongo URI from env
const mongoURI = process.env.MONGO_URI;

// Create GridFS storage
const storage = new GridFsStorage({
  url: mongoURI,
  file: (req, file) => {
    // ✅ Only allow PDFs for now
    if (!file.mimetype.includes("pdf")) {
      return null;
    }
    return {
      filename: `${Date.now()}-${file.originalname}`,
      bucketName: "pdfs", // gridfs collection name (pdfs.files + pdfs.chunks)
    };
  },
});

const upload = multer({ storage });

// ✅ Upload PDF (demo only)
router.post("/pdf/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No PDF uploaded" });
  res.json({ fileId: req.file.id, filename: req.file.filename });
});

// ✅ Stream PDF (demo only)
router.get("/pdf/:filename", async (req, res) => {
  try {
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: "pdfs",
    });
    const stream = bucket.openDownloadStreamByName(req.params.filename);
    res.set("Content-Type", "application/pdf");
    stream.on("error", () => res.status(404).json({ error: "File not found" }));
    stream.pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
