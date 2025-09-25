import express from "express";
import mongoose from "mongoose";

const router = express.Router();

router.get("/:bucket/:id", async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({ success: false, error: "Database not connected" });
    }
    const { bucket, id } = req.params;
    let oid;
    try { oid = new mongoose.Types.ObjectId(id); }
    catch { return res.status(400).json({ success: false, error: "Bad id" }); }

    const b = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: bucket });
    const stream = b.openDownloadStream(oid);

    stream.on("file", (f) => {
      res.set("Content-Type", f.contentType || f.metadata?.mime || "application/octet-stream");
      res.set("Cache-Control", "public, max-age=31536000, immutable");
    });
    stream.on("error", () => res.status(404).end());
    stream.pipe(res);
  } catch (e) {
    console.error("files stream error:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
