// server/utils/gfs.js
import mongoose from "mongoose";
import multer from "multer";
import { GridFsStorage } from "multer-gridfs-storage";
import { ObjectId } from "mongodb";

function makeStorage(bucketName) {
  return new GridFsStorage({
    db: mongoose.connection.asPromise().then((c) => c.db),
    file: (_req, file) => ({
      bucketName,
      filename: `${Date.now()}-${(file.originalname || "file").replace(/\s+/g, "_")}`,
      metadata: { mimetype: file.mimetype },
    }),
  });
}

export function gridUpload(bucketName, field = "file") {
  return multer({ storage: makeStorage(bucketName) }).single(field);
}

export function streamFile(bucketName) {
  return (req, res) => {
    let id;
    try { id = new ObjectId(req.params.id); }
    catch { return res.status(400).json({ success:false, error:"Bad file id" }); }

    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName });
    const dl = bucket.openDownloadStream(id);

    dl.on("file", (file) => {
      res.setHeader("Content-Type", file?.metadata?.mimetype || "application/octet-stream");
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    });
    dl.on("error", () => res.status(404).json({ success:false, error:"Not found" }));
    dl.pipe(res);
  };
}

export function deleteFile(bucketName, id) {
  const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName });
  return bucket.delete(new ObjectId(id)).catch(() => {});
}
