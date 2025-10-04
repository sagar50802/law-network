import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import fsp from "fs/promises";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";

const router = express.Router();

/* ---------------- Cloudflare R2 config (same pattern as PDFs) ---------------- */
const R2_ACCOUNT_ID        = process.env.R2_ACCOUNT_ID || "";
const R2_ACCESS_KEY_ID     = process.env.R2_ACCESS_KEY_ID || "";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "";
const R2_BUCKET            = process.env.R2_BUCKET || "lawprepx";
const R2_PUBLIC_BASE       = (process.env.R2_PUBLIC_BASE || "").replace(/\/+$/, "");

const r2Ready =
  !!R2_ACCOUNT_ID && !!R2_ACCESS_KEY_ID && !!R2_SECRET_ACCESS_KEY && !!R2_PUBLIC_BASE;

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

const PREFIX = "banners/";

/* ---------------- Local fallback directory (if R2 not configured) ----------- */
const ROOT = path.join(process.cwd(), "server");
const LOCAL_DIR = path.join(ROOT, "uploads", "banners");
await fsp.mkdir(LOCAL_DIR, { recursive: true }).catch(() => {});

/* ---------------- Multer (memory) ------------------------------------------- */
const upload = multer({ storage: multer.memoryStorage() });

/* ---------------- Helpers --------------------------------------------------- */
const newId = () =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const safeName = (s) =>
  String(s || "")
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "_")
    .slice(0, 120);

function keyForUpload(original) {
  const ext = path.extname(original || "").toLowerCase() || ".jpg";
  return `${PREFIX}${Date.now()}_${newId()}${ext}`;
}

function inferExtFromType(ct = "") {
  if (/png/i.test(ct)) return ".png";
  if (/webp/i.test(ct)) return ".webp";
  if (/gif/i.test(ct)) return ".gif";
  if (/mp4|video\//i.test(ct)) return ".mp4";
  return ".jpg";
}

function encodeKey(key) {
  // so it works as /api/banners/:id
  return encodeURIComponent(key);
}
function decodeKey(id) {
  return decodeURIComponent(id);
}

/* ---------------- GET /api/banners ----------------------------------------- */
// List everything currently in the bucket (or local folder)
router.get("/", async (_req, res) => {
  try {
    if (r2Ready) {
      const list = await s3.send(
        new ListObjectsV2Command({ Bucket: R2_BUCKET, Prefix: PREFIX })
      );

      const objects = list.Contents || [];
      // Fetch metadata (title/link/content-type) for each object
      const banners = await Promise.all(
        objects.map(async (obj) => {
          const Key = obj.Key;
          if (!Key) return null;
          const head = await s3.send(
            new HeadObjectCommand({ Bucket: R2_BUCKET, Key })
          );
          const type = head.ContentType || "image/*";
          const meta = head.Metadata || {};
          return {
            id: encodeKey(Key),
            url: `${R2_PUBLIC_BASE}/${Key}`,
            type,
            title: meta.title || "",
            link: meta.link || "",
          };
        })
      );

      // newest first
      banners.sort((a, b) => (b && a ? 0 : 0));
      res.json({ success: true, banners: banners.filter(Boolean) });
      return;
    }

    // Local fallback
    const files = (await fsp.readdir(LOCAL_DIR).catch(() => [])) || [];
    const banners = files
      .filter((f) => !f.startsWith("."))
      .map((f) => ({
        id: encodeKey(`${PREFIX}${f}`),
        url: `/uploads/banners/${f}`,
        type: f.toLowerCase().endsWith(".mp4") ? "video/mp4" : "image/*",
        title: "",
        link: "",
      }));
    res.json({ success: true, banners });
  } catch (e) {
    console.error("banners:list error:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

/* ---------------- POST /api/banners ---------------------------------------- */
// Upload via file input or import from a URL (body.url)
router.post("/", upload.single("file"), async (req, res) => {
  try {
    const title = String(req.body?.title || "").trim();
    const link = String(req.body?.link || "").trim();
    const sourceUrl = String(req.body?.url || req.body?.externalUrl || "").trim();

    // Prepare bytes + content-type
    let bytes = null;
    let contentType = "";
    let originalName = "";

    if (req.file && req.file.buffer?.length) {
      bytes = req.file.buffer;
      contentType = req.file.mimetype || "application/octet-stream";
      originalName = req.file.originalname || "banner";
    } else if (sourceUrl) {
      const upstream = await fetch(sourceUrl);
      if (!upstream.ok) {
        return res.status(400).json({ success: false, error: "Failed to fetch source URL" });
      }
      const ab = await upstream.arrayBuffer();
      bytes = Buffer.from(ab);
      contentType = upstream.headers.get("content-type") || "application/octet-stream";
      originalName = path.basename(new URL(sourceUrl).pathname) || "banner";
    } else {
      return res.status(400).json({ success: false, error: "file or url required" });
    }

    if (r2Ready) {
      const ext = path.extname(originalName) || inferExtFromType(contentType);
      const Key = keyForUpload(safeName(originalName.replace(/\.[^.]+$/, ext)));

      await s3.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key,
          Body: bytes,
          ContentType: contentType || "application/octet-stream",
          CacheControl: "public, max-age=31536000, immutable",
          ContentDisposition: `inline; filename="${safeName(originalName)}"`,
          Metadata: {
            title,
            link,
          },
        })
      );

      const item = {
        id: encodeKey(Key),
        url: `${R2_PUBLIC_BASE}/${Key}`,
        type: contentType || "image/*",
        title,
        link,
      };
      res.json({ success: true, item });
      return;
    }

    // Local fallback
    const ext =
      path.extname(originalName) ||
      inferExtFromType(contentType || "").toLowerCase();
    const localName = `${Date.now()}_${newId()}${ext}`;
    await fsp.writeFile(path.join(LOCAL_DIR, localName), bytes);
    const item = {
      id: encodeKey(`${PREFIX}${localName}`),
      url: `/uploads/banners/${localName}`,
      type: contentType || "image/*",
      title,
      link,
    };
    res.json({ success: true, item });
  } catch (e) {
    console.error("banners:upload error:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

/* ---------------- DELETE /api/banners/:id ---------------------------------- */
router.delete("/:id", async (req, res) => {
  try {
    const key = decodeKey(req.params.id || "");
    if (!key || (!key.startsWith(PREFIX) && !key.includes("/"))) {
      return res.status(400).json({ success: false, error: "invalid id" });
    }

    if (r2Ready) {
      await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
      return res.json({ success: true, removed: req.params.id });
    }

    const fname = key.replace(PREFIX, "");
    const abs = path.join(LOCAL_DIR, fname);
    if (abs.startsWith(LOCAL_DIR) && fs.existsSync(abs)) {
      await fsp.unlink(abs).catch(() => {});
    }
    res.json({ success: true, removed: req.params.id });
  } catch (e) {
    console.error("banners:delete error:", e);
    res.status(500).json({ success: false, error: e.message });
  }
});

/* ---------------- Error handler ------------------------------------------- */
router.use((err, _req, res, _next) => {
  console.error("Banners route error:", err);
  res.status(err.status || 500).json({ success: false, message: err.message || "Server error" });
});

export default router;
