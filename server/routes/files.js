// server/routes/files.js (ESM)
import express from "express";
import mongoose from "mongoose";

const router = express.Router();

// GET /api/files/:bucket/:id   -> streams the file
router.get("/:bucket/:id", async (req, res) => {
  try {
    const { bucket, id } = req.params;
    if (!bucket || !id) return res.status(400).json({ success: false, error: "Bad path" });

    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ success: false, error: "Database not connected" });
    }

    const b = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: bucket });
    const _id = new mongoose.Types.ObjectId(id);
    const stream = b.openDownloadStream(_id);

    // Let browser cache and display
    res.setHeader("Access-Control-Expose-Headers", "Content-Type");
    stream.on("error", () =>
      res.status(404).json({ success: false, error: "File not found" })
    );
    stream.pipe(res);
  } catch (e) {
    console.error("File stream error:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
