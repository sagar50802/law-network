// server/routes/files.js
import express from "express";
import mongoose from "mongoose";

const router = express.Router();

/**
 * Stream a file out of GridFS: /api/files/:bucket/:id
 * Works for ANY bucket (articles, banners, consultancy, news, podcasts, videos, pdfs, …)
 */
router.get("/:bucket/:id", async (req, res) => {
  try {
    const { bucket, id } = req.params;
    const db = mongoose.connection?.db;
    if (!db) return res.status(503).send("DB not connected");

    let _id;
    try {
      _id = new mongoose.Types.ObjectId(id);
    } catch {
      return res.status(400).send("Bad file id");
    }

    // Look up the file doc to get contentType and existence
    const filesCol = db.collection(`${bucket}.files`);
    const file = await filesCol.findOne({ _id });
    if (!file) return res.status(404).send("Not found");

    const mime = file.contentType || file.metadata?.mime || "application/octet-stream";
    res.setHeader("Content-Type", mime);
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin"); // safe for <img> cross-origin

    const gfs = new mongoose.mongo.GridFSBucket(db, { bucketName: bucket });
    gfs.openDownloadStream(_id)
      .on("error", () => res.status(404).end())
      .pipe(res);
  } catch (e) {
    console.error("files route error:", e);
    res.status(500).send("Server error");
  }
});

// Optional: HEAD support for quick existence checks
router.head("/:bucket/:id", async (req, res) => {
  try {
    const { bucket, id } = req.params;
    const db = mongoose.connection?.db;
    if (!db) return res.sendStatus(503);
    let _id;
    try {
      _id = new mongoose.Types.ObjectId(id);
    } catch {
      return res.sendStatus(400);
    }
    const filesCol = db.collection(`${bucket}.files`);
    const file = await filesCol.findOne({ _id });
    if (!file) return res.sendStatus(404);
    res.setHeader("Content-Type", file.contentType || file.metadata?.mime || "application/octet-stream");
    res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    return res.sendStatus(200);
  } catch {
    return res.sendStatus(500);
  }
});

export default router;
