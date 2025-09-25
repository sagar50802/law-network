// server/routes/files.js
import express from "express";
import mongoose from "mongoose";

const router = express.Router();

// GET /api/files/:bucket/:id  -> streams the file
router.get("/:bucket/:id", async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ success: false, error: "DB not connected" });
    }
    const { bucket, id } = req.params;
    const _id = new mongoose.Types.ObjectId(id);

    // Optional: look up metadata to set content-type
    const meta = await mongoose.connection.db
      .collection(`${bucket}.files`)
      .findOne({ _id });

    const ctype =
      meta?.contentType ||
      meta?.metadata?.mime ||
      "application/octet-stream";

    res.setHeader("Content-Type", ctype);
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

    const gfs = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: bucket,
    });
    const stream = gfs.openDownloadStream(_id);
    stream.on("error", () =>
      res.status(404).json({ success: false, error: "File not found" })
    );
    stream.pipe(res);
  } catch (err) {
    console.error("files.js stream error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
