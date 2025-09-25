// server/utils/gfs.js
import multer from "multer";
import { GridFsStorage } from "multer-gridfs-storage";
import mongoose from "mongoose";

/** Create a Multer middleware that stores into GridFS (per bucket). */
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
  const uploader = multer({ storage }).single(fieldName);
  return uploader;
}

/** Wrap upload to return JSON errors instead of crashing the process. */
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

/** Delete a GridFS file by ObjectId string. */
export async function deleteFile(bucket, id) {
  if (!id) return;
  const db = mongoose.connection?.db;
  if (!db) return;
  const bucketApi = new mongoose.mongo.GridFSBucket(db, { bucketName: bucket });
  await bucketApi.delete(new mongoose.Types.ObjectId(id)).catch(() => {});
}

/** Extract ObjectId from `/api/files/:bucket/:id` */
export function extractIdFromUrl(url = "", expectedBucket) {
  const re = /^\/api\/files\/([^/]+)\/([a-f0-9]{24})$/i;
  const m = String(url).match(re);
  if (!m) return null;
  const [, bucket, id] = m;
  if (expectedBucket && bucket !== expectedBucket) return null;
  return id;
}
