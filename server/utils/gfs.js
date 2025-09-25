// server/utils/gfs.js
import mongoose from "mongoose";
import multer from "multer";
import { GridFsStorage } from "multer-gridfs-storage";

const MONGO_URI = process.env.MONGO_URI;

/** Create a GridFS upload middleware for a logical bucket (e.g. "banners"). */
export function gridUpload(bucket, fieldName) {
  const storage = new GridFsStorage({
    url: MONGO_URI,
    file: (req, file) => {
      const name = (file.originalname || "file").replace(/\s+/g, "_");
      return {
        filename: `${Date.now()}-${name}`,
        bucketName: `gfs_${bucket}`,
        metadata: {
          bucket,
          mime: file.mimetype,
          original: file.originalname || "",
          by: req.headers["x-owner-key"] || "",
        },
      };
    },
  });
  const upload = multer({ storage });
  return upload.single(fieldName);
}

/** Pull 24-char ObjectId back out of a /api/files/<bucket>/<id> URL. */
export function extractIdFromUrl(url = "", bucket = "") {
  const re = bucket
    ? new RegExp(`/api/files/${bucket}/([a-f0-9]{24})`, "i")
    : /\/api\/files\/(?:[^/]+\/)?([a-f0-9]{24})/i;
  const m = String(url).match(re);
  return m ? m[1] : null;
}

/** Delete a file from a bucket by _id. */
export async function deleteFile(bucket, id) {
  if (!id || !mongoose.connection?.db) return;
  const gfs = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
    bucketName: `gfs_${bucket}`,
  });
  await gfs.delete(new mongoose.Types.ObjectId(id));
}

/** Stream a file: GET /api/files/:bucket/:id */
export async function streamFile(req, res) {
  try {
    const { bucket, id } = req.params;
    if (!mongoose.connection?.db) {
      return res.status(503).json({ success: false, error: "DB not connected" });
    }

    const bucketName = `gfs_${bucket}`;
    const db = mongoose.connection.db;
    const _id = new mongoose.Types.ObjectId(id);

    const fileDoc = await db.collection(`${bucketName}.files`).findOne({ _id });
    if (!fileDoc) return res.status(404).json({ success: false, error: "File not found" });

    const gfs = new mongoose.mongo.GridFSBucket(db, { bucketName });
    res.set(
      "Content-Type",
      fileDoc.contentType || fileDoc.metadata?.mime || "application/octet-stream"
    );

    gfs.openDownloadStream(_id)
      .on("error", () => res.status(404).end())
      .pipe(res);
  } catch (e) {
    console.error("streamFile error:", e);
    res.status(500).json({ success: false, error: e.message });
  }
}
