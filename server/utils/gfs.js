// server/utils/gfs.js
import multer from "multer";
import { GridFsStorage } from "multer-gridfs-storage";
import mongoose from "mongoose";
import { ObjectId } from "mongodb";

/** Create a Multer middleware that stores into GridFS bucket */
export function gridUpload(bucketName, fieldName = "file") {
  const storage = new GridFsStorage({
    url: process.env.MONGO_URI,
    file: (_req, file) => ({
      filename:
        Date.now() + "-" + String(file.originalname || "file").replace(/\s+/g, "_"),
      bucketName,
      metadata: {
        bucket: bucketName,
        mime: file.mimetype || "",
        original: file.originalname || "",
      },
      contentType: file.mimetype || undefined,
    }),
  });
  return multer({ storage }).single(fieldName);
}

/** Delete a GridFS file by bucket + id */
export async function deleteFile(bucketName, id) {
  const db = mongoose.connection?.db;
  if (!db) return;
  const _id = typeof id === "string" ? new ObjectId(id) : id;
  try {
    const bucket = new mongoose.mongo.GridFSBucket(db, { bucketName });
    await bucket.delete(_id);
  } catch (e) {
    // ignore
  }
}

/** Pull ObjectId from /api/files/:bucket/:id URL */
export function extractIdFromUrl(url = "", bucket) {
  const re = bucket
    ? new RegExp(`/api/files/${bucket}/([a-f0-9]{24})`, "i")
    : /\/api\/files\/[a-z0-9_-]+\/([a-f0-9]{24})/i;
  const m = String(url).match(re);
  return m ? m[1] : null;
}

/** Stream a GridFS file to the response */
export async function streamFile(bucketName, id, res) {
  const db = mongoose.connection?.db;
  if (!db) return res.status(503).json({ success: false, error: "DB not connected" });

  let _id;
  try {
    _id = new ObjectId(id);
  } catch {
    return res.status(400).json({ success: false, error: "Bad id" });
  }

  const filesCol = db.collection(`${bucketName}.files`);
  const doc = await filesCol.findOne({ _id });
  if (!doc) return res.status(404).json({ success: false, error: "Not found" });

  if (doc.contentType) res.setHeader("Content-Type", doc.contentType);
  res.setHeader("Cache-Control", "public, max-age=31536000, immutable");

  const bucket = new mongoose.mongo.GridFSBucket(db, { bucketName });
  bucket
    .openDownloadStream(_id)
    .on("error", () => res.status(404).end())
    .pipe(res);
}

/** Wrap Multer so errors return JSON instead of crashing */
export const uploadSafe =
  (mw) =>
  (req, res, next) =>
    mw(req, res, (err) => {
      if (err) {
        console.error("Multer/GridFS error:", err);
        return res
          .status(400)
          .json({ success: false, error: err.message || "Upload failed" });
      }
      next();
    });
