// server/routes/files.js
import express from "express";
import mongoose from "mongoose";

const router = express.Router();

function streamFrom(bucketName, id, req, res) {
  if (!mongoose.connection?.db) {
    return res.status(503).json({ success: false, error: "Database not connected" });
  }
  let _id;
  try { _id = new mongoose.Types.ObjectId(id); }
  catch { return res.status(404).json({ success: false, error: "Invalid file id" }); }

  const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName });

  const s = bucket.openDownloadStream(_id);
  res.setHeader("Access-Control-Expose-Headers", "Content-Type, Content-Length");
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

  s.on("file", (f) => res.setHeader("Content-Type", f.contentType || "application/octet-stream"));
  s.on("error", () => res.status(404).json({ success: false, error: "File not found" }));
  s.pipe(res);
}

// /api/files/:bucket/:id  (preferred)
router.get("/:bucket/:id", (req, res) => streamFrom(req.params.bucket, req.params.id, req, res));

// /api/files/:id  (fallback => bucket "uploads")
router.get("/:id", (req, res) => streamFrom("uploads", req.params.id, req, res));

export default router;
