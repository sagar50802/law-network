// server/routes/pdfs.js
import express from "express";
import multer from "multer";
import { GridFsStorage } from "multer-gridfs-storage";
import mongoose from "mongoose";
import { ObjectId } from "mongodb";
import fsp from "fs/promises";
import path, { extname } from "path";
import dotenv from "dotenv";
import isOwner from "../middlewares/isOwnerWrapper.js";

// ---- R2 (same style as podcasts/videos) ----
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

dotenv.config();
const router = express.Router();

/* ---------------- Cloudflare R2 env ---------------- */
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET || "lawprepx";
const R2_PUBLIC_BASE = (process.env.R2_PUBLIC_BASE || "").replace(/\/+$/, "");
const r2Ready =
  !!R2_ACCOUNT_ID &&
  !!R2_ACCESS_KEY_ID &&
  !!R2_SECRET_ACCESS_KEY &&
  !!R2_PUBLIC_BASE;

const s3 = r2Ready
  ? new S3Client({
      region: "auto",
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    })
  : null;

/* ---------------- Local/DB config ---------------- */
const mongoURI = process.env.MONGO_URI || "";

const ROOT = path.join(process.cwd(), "server");
const DATA_DIR = path.join(ROOT, "data");
const UPLOAD_DIR = path.join(ROOT, "uploads", "pdfs");
const DB_FILE = path.join(DATA_DIR, "pdfs.json");
await fsp.mkdir(DATA_DIR, { recursive: true }).catch(() => {});
await fsp.mkdir(UPLOAD_DIR, { recursive: true }).catch(() => {});

async function readDB() {
  try {
    const raw = await fsp.readFile(DB_FILE, "utf8");
    const json = JSON.parse(raw || "{}");
    json.subjects ||= [];
    return json;
  } catch {
    return { subjects: [] };
  }
}
async function writeDB(db) {
  await fsp.writeFile(DB_FILE, JSON.stringify(db, null, 2), "utf8");
}
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

/* ---------------- Multer storages ---------------- */
// If R2 is configured, take uploads into memory (we'll push to R2)
// else if Mongo is configured, use GridFS
// else save to disk folder
let gridFsStorage = null;
if (!r2Ready && mongoURI) {
  gridFsStorage = new GridFsStorage({
    url: mongoURI,
    file: (_req, file) => {
      if (!file.mimetype || !file.mimetype.includes("pdf")) {
        return Promise.reject(new Error("Only PDF files allowed"));
      }
      return {
        _id: new ObjectId(),
        filename: `${Date.now()}-${(file.originalname || "file.pdf").replace(/\s+/g, "_")}`,
        bucketName: "pdfs",
      };
    },
  });
  gridFsStorage.on("connection", () => console.log("✓ GridFS storage ready (pdfs)"));
  gridFsStorage.on("connectionFailed", (e) =>
    console.error("✗ GridFS storage error:", e?.message)
  );
}

const upload = (() => {
  if (r2Ready) return multer({ storage: multer.memoryStorage() });
  if (gridFsStorage) return multer({ storage: gridFsStorage });
  return multer({ dest: UPLOAD_DIR });
})();

function multerSafe(mw) {
  return (req, res, next) => {
    mw(req, res, (err) => {
      if (err) {
        console.error("⚠️ Multer upload error:", err);
        return res
          .status(400)
          .json({ success: false, message: err.message || "Upload error" });
      }
      next();
    });
  };
}

const uploadChapter = multerSafe(
  upload.fields([
    { name: "pdf", maxCount: 1 },
    { name: "file", maxCount: 1 },
  ])
);

/* ---------------- Routes ---------------- */

// List (public)
router.get("/", async (_req, res) => {
  const db = await readDB();
  res.json({ success: true, subjects: db.subjects });
});

// Create subject (admin)
router.post("/subjects", isOwner, express.json(), async (req, res) => {
  const name = String(
    req.body?.name ||
      req.body?.subjectName ||
      req.query?.name ||
      req.query?.subjectName ||
      ""
  ).trim();

  if (!name) return res.status(400).json({ success: false, message: "Name required" });

  const db = await readDB();
  const id = name.toLowerCase().replace(/\s+/g, "-") || uid();

  const existing = db.subjects.find(
    (s) => s.id === id || s.name.toLowerCase() === name.toLowerCase()
  );
  if (existing) return res.status(200).json({ success: true, subject: existing });

  const subject = { id, name, chapters: [] };
  db.subjects.push(subject);
  await writeDB(db);
  res.json({ success: true, subject });
});

// Add chapter (admin) — accepts file OR url
router.post("/subjects/:sid/chapters", isOwner, uploadChapter, async (req, res) => {
  try {
    const db = await readDB();
    const sub = db.subjects.find((s) => s.id === req.params.sid);
    if (!sub) return res.status(404).json({ success: false, message: "Subject not found" });

    const file = req.files?.pdf?.[0] || req.files?.file?.[0] || null;
    const urlFromBody = String(req.body?.url || req.body?.pdfUrl || req.query?.url || "").trim();
    if (!file && !urlFromBody) {
      return res.status(400).json({ success: false, message: "PDF file or URL required" });
    }

    const title = String(req.body?.title || "Untitled").slice(0, 200);
    const locked =
      String(req.body?.locked) === "true" || req.body?.locked === true;

    let url = urlFromBody;

    // If a file was uploaded, persist it to R2 / GridFS / disk and produce a URL
    if (file) {
      if (r2Ready) {
        const ext = (extname(file.originalname || "") || ".pdf").toLowerCase() || ".pdf";
        const key = `pdfs/${req.params.sid}/${Date.now()}_${uid()}${ext}`;
        await s3.send(
          new PutObjectCommand({
            Bucket: R2_BUCKET,
            Key: key,
            Body: file.buffer, // memory storage
            ContentType: "application/pdf",
          })
        );
        url = `${R2_PUBLIC_BASE}/${key}`;
      } else if (mongoURI) {
        // GridFS filename is already set by the storage
        const filename = file.filename;
        url = `/api/gridfs/pdf/${filename}`;
      } else {
        // Disk — ensure path is within our uploads/pdfs folder
        const base = path.basename(file.filename || file.path);
        url = `/uploads/pdfs/${base}`;
      }
    }

    const ch = {
      id: uid(),
      title,
      url,
      locked,
      createdAt: new Date().toISOString(),
    };
    sub.chapters.push(ch);
    await writeDB(db);
    res.json({ success: true, chapter: ch });
  } catch (err) {
    console.error("⚠️ Chapter upload error:", err);
    res.status(500).json({ success: false, message: err.message || "Server error" });
  }
});

// Delete one chapter (admin)
router.delete("/subjects/:sid/chapters/:cid", isOwner, async (req, res) => {
  const db = await readDB();
  const sub = db.subjects.find((s) => s.id === req.params.sid);
  if (!sub) return res.status(404).json({ success: false, message: "Subject not found" });

  const idx = sub.chapters.findIndex((c) => c.id === req.params.cid);
  if (idx < 0) return res.status(404).json({ success: false, message: "Chapter not found" });

  const removed = sub.chapters.splice(idx, 1)[0];

  // Clean up storage if possible
  try {
    if (removed?.url) {
      if (r2Ready && removed.url.startsWith(R2_PUBLIC_BASE + "/")) {
        const key = removed.url.substring(R2_PUBLIC_BASE.length + 1);
        if (key) await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
      } else if (mongoURI && removed.url.includes("/api/gridfs/pdf/")) {
        // best-effort GridFS delete
        const filename = removed.url.split("/").pop();
        if (mongoose.connection.readyState === 1) {
          const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
            bucketName: "pdfs",
          });
          const files = await mongoose.connection.db
            .collection("pdfs.files")
            .find({ filename })
            .toArray();
          if (files.length) await bucket.delete(files[0]._id);
        }
      } else if (removed.url.startsWith("/uploads/pdfs/")) {
        const filePath = path.join(ROOT, removed.url);
        fsp.unlink(filePath).catch(() => {});
      }
    }
  } catch (e) {
    console.warn("PDF delete warning:", e?.message || e);
  }

  await writeDB(db);
  res.json({ success: true, removed });
});

// Delete subject (admin)
router.delete("/subjects/:sid", isOwner, async (req, res) => {
  const db = await readDB();
  const idx = db.subjects.findIndex((s) => s.id === req.params.sid);
  if (idx < 0) return res.status(404).json({ success: false, message: "Subject not found" });

  const sub = db.subjects[idx];

  // Clean up all chapters
  for (const ch of sub.chapters || []) {
    try {
      if (ch?.url) {
        if (r2Ready && ch.url.startsWith(R2_PUBLIC_BASE + "/")) {
          const key = ch.url.substring(R2_PUBLIC_BASE.length + 1);
          if (key) await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
        } else if (mongoURI && ch.url.includes("/api/gridfs/pdf/")) {
          const filename = ch.url.split("/").pop();
          if (mongoose.connection.readyState === 1) {
            const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
              bucketName: "pdfs",
            });
            const files = await mongoose.connection.db
              .collection("pdfs.files")
              .find({ filename })
              .toArray();
            if (files.length) await bucket.delete(files[0]._id);
          }
        } else if (ch.url.startsWith("/uploads/pdfs/")) {
          const filePath = path.join(ROOT, ch.url);
          fsp.unlink(filePath).catch(() => {});
        }
      }
    } catch (e) {
      console.warn("Subject cleanup warning:", e?.message || e);
    }
  }

  db.subjects.splice(idx, 1);
  await writeDB(db);
  res.json({ success: true });
});

/* ---------------- PDF stream proxy (CORS/ORB-safe, with R2 fallback) ---------------- */
router.get("/stream", async (req, res) => {
  try {
    const src = String(req.query.src || "").trim();
    if (!src) return res.status(400).send("Missing src");

    const range = req.headers.range;
    let upstream = await fetch(src, { headers: range ? { Range: range } : {} });

    // Upstream failed but URL looks like our R2 public link → try authenticated R2 read
    if (
      (!upstream.ok || (upstream.status !== 200 && upstream.status !== 206)) &&
      r2Ready &&
      src.startsWith(R2_PUBLIC_BASE + "/")
    ) {
      const key = src.substring(R2_PUBLIC_BASE.length + 1);
      try {
        const obj = await s3.send(
          new GetObjectCommand({
            Bucket: R2_BUCKET,
            Key: key,
            Range: range,
          })
        );

        const status = obj.ContentRange ? 206 : 200;
        const headers = {
          "Content-Type": obj.ContentType || "application/pdf",
          "Accept-Ranges": "bytes",
          "Cache-Control": obj.CacheControl || "no-transform, public, max-age=86400",
          "Access-Control-Expose-Headers": "Content-Length,Content-Range,Accept-Ranges",
          "Cross-Origin-Resource-Policy": "cross-origin",
          "Content-Disposition": obj.ContentDisposition || 'inline; filename="document.pdf"',
        };
        if (obj.ContentLength != null) headers["Content-Length"] = String(obj.ContentLength);
        if (obj.ContentRange) headers["Content-Range"] = obj.ContentRange;

        res.writeHead(status, headers);
        obj.Body.on("error", () => {
          try { res.end(); } catch {}
        }).pipe(res);
        return;
      } catch (e) {
        console.warn("R2 fallback GetObject failed:", e?.message || e);
        // fall through to return upstream’s error text
      }
    }

    // If upstream is good, stream it through as-is
    if (upstream.ok && (upstream.status === 200 || upstream.status === 206)) {
      const headers = {
        "Content-Type": upstream.headers.get("content-type") || "application/pdf",
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-transform, public, max-age=86400",
        "Access-Control-Expose-Headers": "Content-Length,Content-Range,Accept-Ranges",
        "Cross-Origin-Resource-Policy": "cross-origin",
        "Content-Disposition": 'inline; filename="document.pdf"',
      };
      const len = upstream.headers.get("content-length");
      if (len) headers["Content-Length"] = len;
      const cr = upstream.headers.get("content-range");
      if (cr) headers["Content-Range"] = cr;

      res.writeHead(upstream.status, headers);
      if (!upstream.body) return res.end();
      const { Readable } = await import("node:stream");
      Readable.fromWeb(upstream.body)
        .on("error", () => { try { res.end(); } catch {} })
        .pipe(res);
      return;
    }

    // Error path: forward real status as text so pdf.js won't try to parse XML/HTML as PDF
    const text = await upstream.text().catch(() => "Upstream error");
    res.set({
      "Content-Type": "text/plain; charset=utf-8",
      "Access-Control-Expose-Headers": "Content-Length,Content-Range,Accept-Ranges",
      "Cross-Origin-Resource-Policy": "cross-origin",
    });
    res.status(upstream.status || 502).send(text);
  } catch (e) {
    console.error("pdf stream proxy failed:", e);
    if (!res.headersSent) res.status(502).send("Upstream error");
    else try { res.end(); } catch {}
  }
});

/* ---------------- Error handler ---------------- */
router.use((err, _req, res, _next) => {
  console.error("PDFs route error:", err);
  res
    .status(err.status || 500)
    .json({ success: false, message: err.message || "Server error" });
});

export default router;
