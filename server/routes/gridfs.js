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
    return {
      filename: `${Date.now()}-${file.originalname}`,
      bucketName: "uploads", // collection will be fs.files / fs.chunks
    };
  },
});

const upload = multer({ storage });

// ✅ Upload File
router.post("/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No file uploaded" });
  res.json({ fileId: req.file.id, filename: req.file.filename });
});

// ✅ Stream File
router.get("/file/:filename", async (req, res) => {
  try {
    const conn = mongoose.connection;
    const bucket = new GridFSBucket(conn.db, { bucketName: "uploads" });

    const stream = bucket.openDownloadStreamByName(req.params.filename);
    stream.on("error", () => res.status(404).json({ error: "File not found" }));
    stream.pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
