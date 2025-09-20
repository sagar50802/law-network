// server/routes/gridfs.js
const express = require("express");
const mongoose = require("mongoose");
const multer = require("multer");
const { GridFsStorage } = require("multer-gridfs-storage");

const router = express.Router();

const mongoURI = process.env.MONGO_URI;

// ---------------- GridFS Storage ----------------
const storage = new GridFsStorage({
  url: mongoURI,
  file: (req, file) => {
    if (!file.mimetype.includes("pdf")) return null;
    return {
      filename: `${Date.now()}-${file.originalname}`,
      bucketName: "pdfs", // collection pdfs.files + pdfs.chunks
    };
  },
});

const upload = multer({ storage });

// ---------------- Upload (manual/demo) ----------------
// You probably don’t need this because pdfs.js already handles uploads,
// but keeping it for testing/debugging.
router.post("/pdf/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ error: "No PDF uploaded" });
  res.json({
    success: true,
    fileId: req.file.id,
    filename: req.file.filename,
    url: `/api/gridfs/pdf/${req.file.filename}`, // 🔹 same format as pdfs.js
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

    stream.on("error", () => res.status(404).json({ error: "File not found" }));
    stream.pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ---------------- Stream by ID (optional) ----------------
router.get("/pdf/id/:id", async (req, res) => {
  try {
    const fileId = new mongoose.Types.ObjectId(req.params.id);
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: "pdfs",
    });

    const stream = bucket.openDownloadStream(fileId);

    res.set("Content-Type", "application/pdf");

    stream.on("error", () => res.status(404).json({ error: "File not found" }));
    stream.pipe(res);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
