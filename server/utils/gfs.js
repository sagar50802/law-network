// server/routes/gfs.js
import multer from "multer";
import { GridFsStorage } from "multer-gridfs-storage";
import mongoose from "mongoose";

/** Create a Multer middleware that stores a single field into GridFS bucket */
export function gridUpload(bucket, fieldName = "file") {
  const storage = new GridFsStorage({
    url: process.env.MONGO_URI,
    file: (_req, file) => {
      const safe = (file.originalname || "file")
        .replace(/\s+/g, "_")
        .replace(/[^\w.\-]/g, "");
      return {
        filename: `${Date.now()}-${safe}`,
        bucketName: bucket,
        metadata: { mime: file.mimetype || "application/octet-stream", bucket },
      };
    },
  });
  return multer({ storage }).single(fieldName);
}

/** Wrap upload to return JSON errors (no 502s) */
export const uploadSafe = (mw) => (req, res, next) => {
  mw(req, res, (err) => {
    if (err) {
      console.error("Upload error:", err);
      return res
        .status(400)
        .json({ success: false, error: err.message || "Upload failed" });
    }
    next();
  });
};

/** Delete a GridFS file by id string */
export async function deleteFile(bucket, id) {
  if (!id) return;
  const db = mongoose.connection?.db;
  if (!db) return;
  const gfs = new mongoose.mongo.GridFSBucket(db, { bucketName: bucket });
  await gfs.delete(new mongoose.Types.ObjectId(id)).catch(() => {});
}

/** Extract ObjectId from `/api/files/:bucket/:id` (optionally validate bucket) */
export function extractIdFromUrl(url = "", expectedBucket) {
  const m = String(url).match(/^\/api\/files\/([^/]+)\/([a-f0-9]{24})$/i);
  if (!m) return null;
  const [, b, id] = m;
  if (expectedBucket && b !== expectedBucket) return null;
  return id;
}
