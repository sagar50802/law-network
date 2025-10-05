// server/routes/files.js
import { Router } from "express";
import mongoose from "mongoose";

const router = Router();

// Stream by bucket + ObjectId
router.get("/:bucket/:id", async (req, res) => {
  try {
    const { bucket, id } = req.params;
    if (!mongoose.connection?.db) return res.status(503).send("DB not ready");

    const g = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: bucket,
    });

    const _id = new mongoose.Types.ObjectId(id);
    const files = await g.find({ _id }).toArray();
    if (!files.length) return res.status(404).send("Not found");

    // Content-Type from GridFS metadata if present
    res.setHeader("Content-Type", files[0].contentType || "application/octet-stream");
    // Long cache; client can add ?t= timestamp when updating
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

    g.openDownloadStream(_id)
      .on("error", (e) => res.status(500).end(e.message))
      .pipe(res);
  } catch {
    res.status(400).send("Bad id");
  }
});

export default router;
