// server/routes/pdfs.js
import express from "express";
import multer from "multer";
import { GridFsStorage } from "multer-gridfs-storage";
import mongoose from "mongoose";
import { ObjectId } from "mongodb";
import fsp from "fs/promises";
import path from "path";
import dotenv from "dotenv";
// ⬇️ use the same wrapper you used for podcasts/videos
import isOwner from "../middlewares/isOwnerWrapper.js";

dotenv.config();

const router = express.Router();

// ── Config ───────────────────────────────
const mongoURI = process.env.MONGO_URI || "";

const ROOT = path.join(process.cwd(), "server");
const DATA_DIR = path.join(ROOT, "data");
const DB_FILE = path.join(DATA_DIR, "pdfs.json");
fsp.mkdir(DATA_DIR, { recursive: true }).catch(() => {});

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

// ── GridFS storage ───────────────────────
let storage;
if (mongoURI) {
  storage = new GridFsStorage({
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
  storage.on("connection", () => console.log("✓ GridFS storage ready (pdfs)"));
  storage.on("connectionFailed", (e) => console.error("✗ GridFS storage error:", e?.message));
}

const upload = storage ? multer({ storage }) : multer({ dest: path.join(ROOT, "uploads", "pdfs") });

function multerSafe(mw) {
  return (req, res, next) => {
    mw(req, res, (err) => {
      if (err) {
        console.error("⚠️ Multer upload error:", err);
        return res.status(400).json({ success: false, message: err.message || "Upload error" });
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

// ── Routes ───────────────────────────────

// List (public)
router.get("/", async (_req, res) => {
  const db = await readDB();
  res.json({ success: true, subjects: db.subjects });
});

// Create subject (admin/owner)
// Accept name from BODY *or* QUERY (your client sometimes sends ?name=...)
router.post("/subjects", isOwner, express.json(), async (req, res) => {
  const name =
    String(
      req.body?.name ||
      req.body?.subjectName ||
      req.query?.name ||
      req.query?.subjectName ||
      ""
    ).trim();

  if (!name) return res.status(400).json({ success: false, message: "Name required" });

  const db = await readDB();
  const id = name.toLowerCase().replace(/\s+/g, "-") || uid();

  const existing = db.subjects.find((s) => s.id === id || s.name.toLowerCase() === name.toLowerCase());
  if (existing) return res.status(200).json({ success: true, subject: existing });

  const subject = { id, name, chapters: [] };
  db.subjects.push(subject);
  await writeDB(db);
  res.json({ success: true, subject });
});

// Add chapter (admin/owner)
// Accept either an uploaded PDF (pdf/file) OR a direct URL in body/query
router.post("/subjects/:sid/chapters", isOwner, uploadChapter, async (req, res) => {
  try {
    const db = await readDB();
    const sub = db.subjects.find((s) => s.id === req.params.sid);
    if (!sub) return res.status(404).json({ success: false, message: "Subject not found" });

    const file = req.files?.pdf?.[0] || req.files?.file?.[0] || null;

    const urlFromBody =
      String(req.body?.url || req.body?.pdfUrl || req.query?.url || "").trim();

    if (!file && !urlFromBody) {
      return res.status(400).json({ success: false, message: "PDF file or URL required" });
    }

    const title = String(req.body?.title || "Untitled").slice(0, 200);
    const locked = String(req.body?.locked) === "true" || req.body?.locked === true;

    const url = file
      ? (mongoURI
          ? `/api/gridfs/pdf/${file.filename}`
          : `/uploads/pdfs/${file.filename}`)
      : urlFromBody;

    const ch = { id: uid(), title, url, locked, createdAt: new Date().toISOString() };
    sub.chapters.push(ch);
    await writeDB(db);
    res.json({ success: true, chapter: ch });
  } catch (err) {
    console.error("⚠️ Chapter upload error:", err);
    res.status(500).json({ success: false, message: err.message || "Server error" });
  }
});

// Delete chapter
router.delete("/subjects/:sid/chapters/:cid", isOwner, async (req, res) => {
  const db = await readDB();
  const sub = db.subjects.find((s) => s.id === req.params.sid);
  if (!sub) return res.status(404).json({ success: false, message: "Subject not found" });

  const idx = sub.chapters.findIndex((c) => c.id === req.params.cid);
  if (idx < 0) return res.status(404).json({ success: false, message: "Chapter not found" });

  const removed = sub.chapters.splice(idx, 1)[0];

  // Best-effort GridFS cleanup
  if (mongoURI && removed?.url?.includes("/api/gridfs/pdf/")) {
    const filename = removed.url.split("/").pop();
    try {
      if (mongoose.connection.readyState === 1) {
        const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "pdfs" });
        const files = await mongoose.connection.db.collection("pdfs.files").find({ filename }).toArray();
        if (files.length) await bucket.delete(files[0]._id);
      }
    } catch (err) {
      console.error("⚠️ GridFS delete error:", err.message);
    }
  }

  await writeDB(db);
  res.json({ success: true, removed });
});

// Delete subject
router.delete("/subjects/:sid", isOwner, async (req, res) => {
  const db = await readDB();
  const idx = db.subjects.findIndex((s) => s.id === req.params.sid);
  if (idx < 0) return res.status(404).json({ success: false, message: "Subject not found" });

  const sub = db.subjects[idx];

  try {
    if (mongoURI && mongoose.connection.readyState === 1) {
      const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "pdfs" });
      for (const ch of sub.chapters || []) {
        if (ch.url?.includes("/api/gridfs/pdf/")) {
          const filename = ch.url.split("/").pop();
          const files = await mongoose.connection.db.collection("pdfs.files").find({ filename }).toArray();
          if (files.length) await bucket.delete(files[0]._id);
        }
      }
    }
  } catch (err) {
    console.error("⚠️ GridFS subject delete error:", err.message);
  }

  db.subjects.splice(idx, 1);
  await writeDB(db);
  res.json({ success: true });
});

// Toggle lock/unlock
router.patch("/subjects/:sid/chapters/:cid/lock", isOwner, express.json({ limit: "5mb" }), async (req, res) => {
  const db = await readDB();
  const sub = db.subjects.find((s) => s.id === req.params.sid);
  const ch = sub?.chapters.find((c) => c.id === req.params.cid);
  if (!ch) return res.status(404).json({ success: false, message: "Chapter not found" });

  ch.locked = !!req.body.locked;
  await writeDB(db);
  res.json({ success: true, chapter: ch });
});

// CORS/ORB-safe PDF proxy (optional but handy)
router.get("/stream", async (req, res) => {
  try {
    const src = String(req.query.src || "").trim();
    if (!src) return res.status(400).send("Missing src");
    const range = req.headers.range;
    const upstream = await fetch(src, { headers: range ? { Range: range } : {} });

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

    res.writeHead(upstream.status === 206 ? 206 : 200, headers);
    if (!upstream.body) return res.end();
    const { Readable } = await import("node:stream");
    Readable.fromWeb(upstream.body).on("error", () => { try { res.end(); } catch {} }).pipe(res);
  } catch (e) {
    console.error("pdf proxy failed:", e);
    if (!res.headersSent) res.status(502).send("Upstream error"); else try { res.end(); } catch {}
  }
});

router.use((err, _req, res, _next) => {
  console.error("PDFs route error:", err);
  res.status(err.status || 500).json({ success: false, message: err.message || "Server error" });
});

export default router;
