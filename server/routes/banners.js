import express from "express";
import multer from "multer";
import mongoose from "mongoose";

const router = express.Router();

/* ---------- tiny utility: wait for Mongo ---------- */
const MONGO_URI = process.env.MONGO_URI || "";

async function ensureMongoReady(timeoutMs = 10000) {
  // 0 = disconnected, 1 = connected, 2 = connecting, 3 = disconnecting
  const start = Date.now();
  if (!MONGO_URI) return false;

  while (mongoose.connection.readyState !== 1) {
    try {
      if (mongoose.connection.readyState === 0) {
        await mongoose.connect(MONGO_URI, {
          serverSelectionTimeoutMS: 2000,
        });
      } else {
        // connecting/disconnecting; small pause
        await new Promise((r) => setTimeout(r, 150));
      }
    } catch {
      // swallow & retry until timeout
    }
    if (Date.now() - start > timeoutMs) break;
  }
  return mongoose.connection.readyState === 1;
}

function requireMongoMw(timeoutMs = 10000) {
  return async (_req, res, next) => {
    const ok = await ensureMongoReady(timeoutMs);
    if (!ok) {
      res.set("Retry-After", "2");
      return res
        .status(503)
        .json({ success: false, error: "DB not connected yet" });
    }
    next();
  };
}

/* ---------- helpers (safe) ---------- */
async function makeStorage(bucket) {
  const { GridFsStorage } = await import("multer-gridfs-storage");
  return new GridFsStorage({
    url: MONGO_URI,
    file: (req, file) => {
      const safe = (file.originalname || "file")
        .replace(/\s+/g, "_")
        .replace(/[^\w.\-]/g, "");
      return {
        filename: `${Date.now()}-${safe}`,
        bucketName: bucket,
        metadata: {
          mime: file.mimetype || "application/octet-stream",
          title: req.body?.title || "",
          link: req.body?.link || "",
        },
      };
    },
  });
}

function grid(bucket) {
  const db = mongoose.connection?.db;
  if (!db) return null;
  return new mongoose.mongo.GridFSBucket(db, { bucketName: bucket });
}

/* ---------- multer storage ---------- */
// create storage once; it uses its own connection string internally
const storage = await makeStorage("banners");
const upload = multer({ storage });

/* ---------- routes ---------- */

// List all banners (from GridFS 'banners' bucket)
router.get("/", requireMongoMw(), async (_req, res) => {
  try {
    const db = mongoose.connection?.db;
    const files = await db
      .collection("banners.files")
      .find({})
      .sort({ uploadDate: -1 })
      .toArray();

    const banners = files.map((f) => ({
      id: f._id.toString(),
      url: `/api/files/banners/${f._id.toString()}`,
      type: f.metadata?.mime || f.contentType || "image/*",
      title: f.metadata?.title || "",
      link: f.metadata?.link || "",
    }));

    res.json({ success: true, banners });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Upload one banner (image/video)
router.post(
  "/",
  requireMongoMw(),           // <- wait for DB
  upload.single("file"),
  async (req, res) => {
    try {
      if (!req.file)
        return res.status(400).json({ success: false, error: "file required" });
      const item = {
        id: String(req.file.id),
        url: `/api/files/banners/${String(req.file.id)}`,
        type: req.file.mimetype || req.file.metadata?.mime || "image/*",
        title: req.body?.title || "",
        link: req.body?.link || "",
      };
      res.json({ success: true, item });
    } catch (e) {
      res.status(500).json({ success: false, error: e.message });
    }
  }
);

// Delete by GridFS id
router.delete("/:id", requireMongoMw(), async (req, res) => {
  try {
    const b = grid("banners");
    await b.delete(new mongoose.Types.ObjectId(req.params.id));
    res.json({ success: true, removed: req.params.id });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

/* ---------- OPTIONAL: file stream alias (if you don't already have /api/files/banners/:id elsewhere) ---------- */
// Uncomment if needed:
// router.get("/file/:id", requireMongoMw(), async (req, res) => {
//   try {
//     const b = grid("banners");
//     const id = new mongoose.Types.ObjectId(req.params.id);
//     res.set({
//       "Cache-Control": "public, max-age=86400",
//       "Content-Type": "application/octet-stream",
//       "Content-Disposition": 'inline; filename="banner"'
//     });
//     b.openDownloadStream(id)
//       .on("error", () => res.sendStatus(404))
//       .pipe(res);
//   } catch {
//     res.sendStatus(404);
//   }
// });

/* ---------- error handler ---------- */
router.use((err, _req, res, _next) => {
  console.error("Banners route error:", err);
  res.status(err.status || 500).json({ success: false, message: err.message || "Server error" });
});

export default router;
