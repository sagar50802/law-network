// server/routes/files.js (ESM)
import express from "express";
import mongoose from "mongoose";

const router = express.Router();

// GET /api/files/:bucket/:id  -> streams GridFS file by ObjectId
router.get("/:bucket/:id", async (req, res) => {
  try {
    const { bucket, id } = req.params;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: "Bad file id" });
    }
    const db = mongoose.connection?.db;
    if (!db) return res.status(503).json({ success: false, error: "DB not connected" });

    const b = new mongoose.mongo.GridFSBucket(db, { bucketName: bucket });
    const stream = b.openDownloadStream(new mongoose.Types.ObjectId(id));

    stream.on("file", (f) => {
      if (f?.contentType) res.type(f.contentType);
      // allow embedding across origins
      res.set("Cross-Origin-Resource-Policy", "cross-origin");
    });
    stream.on("error", () => res.status(404).json({ success: false, error: "File not found" }));
    stream.pipe(res);
  } catch (e) {
    console.error("files stream error:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
