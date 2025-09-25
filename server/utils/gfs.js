// server/utils/gfs.js (ESM)
import multer from "multer";
import { GridFsStorage } from "multer-gridfs-storage";
import mongoose from "mongoose";

/** Create a multer middleware that stores a single file into GridFS under a bucket. */
export function gridUpload(bucketName, fieldName = "file") {
  const storage = new GridFsStorage({
    url: process.env.MONGO_URI,
    file: (_req, file) => ({
      filename: `${Date.now()}-${(file.originalname || "file").replace(/\s+/g, "_")}`,
      bucketName,
      metadata: {
        bucket: bucketName,
        mime: file.mimetype,
        original: file.originalname,
      },
    }),
  });
  return multer({ storage }).single(fieldName);
}

/** Stream a GridFS file. If defaultBucket is given, use it; else read :bucket from the route. */
export function streamFile(defaultBucket) {
  return async function handler(req, res) {
    try {
      if (mongoose.connection.readyState !== 1) {
        return res.status(503).json({ success: false, error: "Database not connected" });
      }

      const id = req.params.id;
      const bucketName = defaultBucket || req.params.bucket || "uploads";
      const _id = new mongoose.Types.ObjectId(id);

      // Look up file to set content-type nicely
      const filesCol = mongoose.connection.db.collection(`${bucketName}.files`);
      const fileDoc = await filesCol.findOne({ _id });
      const ctype = fileDoc?.contentType || fileDoc?.metadata?.mime || "application/octet-stream";
      res.setHeader("Content-Type", ctype);

      const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName });
      const stream = bucket.openDownloadStream(_id);
      stream.on("error", () => res.status(404).json({ success: false, error: "File not found" }));
      stream.pipe(res);
    } catch (err) {
      console.error("GridFS stream error:", err);
      res.status(500).json({ success: false, error: err.message });
    }
  };
}

/** Delete a GridFS file by id from a bucket. */
export async function deleteFile(bucketName, id) {
  if (!id) return;
  if (mongoose.connection.readyState !== 1) return;
  const _id = new mongoose.Types.ObjectId(id);
  const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName });
  await bucket.delete(_id).catch(() => {});
}

/** Extract 24-char id from either /api/files/<bucket>/<id> or legacy /api/files/<id> */
export function extractIdFromUrl(url, bucketName) {
  if (!url) return null;
  const s = String(url);

  // New style: /api/files/<bucket>/<id>
  const m1 = s.match(new RegExp(`/api/files/${bucketName}/([a-f0-9]{24})$`, "i"));
  if (m1) return m1[1];

  // Legacy: /api/files/<id>
  const m2 = s.match(/\/api\/files\/([a-f0-9]{24})$/i);
  return m2 ? m2[1] : null;
}
