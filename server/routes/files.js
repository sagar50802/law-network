// server/routes/files.js
import express from "express";
import mongoose from "mongoose";

const router = express.Router();

// GET /api/files/:bucket/:id  -> stream one file from GridFS
router.get("/:bucket/:id", async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ success: false, error: "DB not connected" });
    }
    const { bucket, id } = req.params;
    const _id = new mongoose.Types.ObjectId(id);

    const gfs = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: bucket,
    });

    const file = await mongoose.connection.db
      .collection(`${bucket}.files`)
      .findOne({ _id });

    if (!file) return res.status(404).json({ success: false, error: "Not found" });

    res.set("Cross-Origin-Resource-Policy", "cross-origin");
    res.set("Content-Type", file?.metadata?.mime || file?.contentType || "application/octet-stream");

    const stream = gfs.openDownloadStream(_id);
    stream.on("error", () => res.status(404).end());
    stream.pipe(res);
  } catch (e) {
    console.error("files route error:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
