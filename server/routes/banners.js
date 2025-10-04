// server/routes/banners.js  — GridFS (no multer-gridfs-storage)
import express from "express";
import multer from "multer";
import mongoose from "mongoose";

const router = express.Router();

/* ---------------- helpers ---------------- */

function bucket(name = "banners") {
  // 1 = connected, 2 = connecting (we allow when db exists)
  if (mongoose.connection.readyState !== 1 && !mongoose.connection.db) return null;
  return new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: name });
}

const upload = multer({ storage: multer.memoryStorage() });

const safeName = (s = "file") =>
  String(s)
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "_")
    .slice(0, 120);

/* ---------------- routes ---------------- */

// List all banners
router.get("/", async (_req, res) => {
  try {
    if (!mongoose.connection.db) {
      return res.status(503).json({ success: false, message: "DB not connected" });
    }
    const files = await mongoose.connection.db
      .collection("banners.files")
      .find({})
      .sort({ uploadDate: -1 })
      .toArray();

    const banners = files.map((f) => ({
      id: String(f._id),
      // keep the same URL your client already uses:
      url: `/api/files/banners/${String(f._id)}`,
      type: f.contentType || f.metadata?.mime || "image/*",
      title: f.metadata?.title || "",
      link: f.metadata?.link || "",
      uploadedAt: f.uploadDate,
    }));

    res.json({ success: true, banners });
  } catch (e) {
    console.error("List banners error:", e);
    res.status(500).json({ success: false, message: e.message || "Server error" });
  }
});

// Upload one banner (image/video) — memory → GridFS
router.post("/", upload.single("file"), async (req, res) => {
  try {
    if (!req.file || !req.file.buffer?.length) {
      return res.status(400).json({ success: false, message: "file required" });
    }
    const b = bucket("banners");
    if (!b) return res.status(503).json({ success: false, message: "DB not connected" });

    const filename = `${Date.now()}-${safeName(req.file.originalname || "banner")}`;
    const metadata = {
      mime: req.file.mimetype || "application/octet-stream",
      title: req.body?.title || "",
      link: req.body?.link || "",
    };

    // Write to GridFS
    const uploadStream = b.openUploadStream(filename, {
      contentType: req.file.mimetype || "application/octet-stream",
      metadata,
    });
    // end() writes the whole buffer and closes stream
    uploadStream.end(req.file.buffer);

    await new Promise((resolve, reject) => {
      uploadStream.on("finish", resolve);
      uploadStream.on("error", reject);
    });

    const id = String(uploadStream.id);
    res.json({
      success: true,
      item: {
        id,
        url: `/api/files/banners/${id}`,
        type: req.file.mimetype || "image/*",
        title: metadata.title,
        link: metadata.link,
      },
    });
  } catch (e) {
    console.error("Upload banner error:", e);
    res.status(500).json({ success: false, message: e.message || "Server error" });
  }
});

// Delete by GridFS id
router.delete("/:id", async (req, res) => {
  try {
    const b = bucket("banners");
    if (!b) return res.status(503).json({ success: false, message: "DB not connected" });
    await b.delete(new mongoose.Types.ObjectId(req.params.id));
    res.json({ success: true, removed: req.params.id });
  } catch (e) {
    console.error("Delete banner error:", e);
    res.status(500).json({ success: false, message: e.message || "Server error" });
  }
});

/** OPTIONAL fallback streamer
 * Only add this if you DON'T already have /api/files/banners/:id elsewhere.
 * If you add it, mount THIS router at "/api" (not "/api/banners"), or change the path.
 */
// router.get("/files/banners/:id", async (req, res) => {
//   try {
//     const b = bucket("banners");
//     if (!b) return res.status(503).send("DB not connected");
//     const id = new mongoose.Types.ObjectId(req.params.id);
//     res.set({
//       "Content-Type": "application/octet-stream",
//       "Cache-Control": "public, max-age=86400, immutable",
//     });
//     b.openDownloadStream(id)
//       .on("error", () => res.status(404).end())
//       .pipe(res);
//   } catch {
//     res.status(400).end();
//   }
// });

/* --------------- error handler --------------- */
router.use((err, _req, res, _next) => {
  console.error("Banners route error:", err);
  res.status(err?.status || 500).json({ success: false, message: err?.message || "Server error" });
});

export default router;
