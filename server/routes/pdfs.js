import express from "express";
import multer from "multer";
import { GridFsStorage } from "multer-gridfs-storage";
import mongoose from "mongoose";
import { ObjectId } from "mongodb";
import fsp from "fs/promises";
import path from "path";
import dotenv from "dotenv";
import { isAdmin } from "./utils.js";

dotenv.config();

const router = express.Router();

const mongoURI = process.env.MONGO_URI || "";

// Optional public R2 base, used by /pdfs/stream allowlist
const R2_PUBLIC_BASE = (process.env.R2_PUBLIC_BASE || "").replace(/\/+$/, "");

// ── JSON metadata storage ──
const ROOT = path.join(process.cwd(), "server");
const DATA_DIR = path.join(ROOT, "data");
const DB_FILE = path.join(DATA_DIR, "pdfs.json");
await fsp.mkdir(DATA_DIR, { recursive: true }).catch(() => {});

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

// ── GridFS / Multer ──
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
const uploadChapter = (req, res, next) =>
  upload.fields([{ name: "pdf", maxCount: 1 }, { name: "file", maxCount: 1 }])(req, res, (err) => {
    if (err) return res.status(400).json({ success: false, message: err.message || "Upload error" });
    next();
  });

// ── Routes ──

// Public list
router.get("/", async (_req, res) => {
  const db = await readDB();
  res.json({ success: true, subjects: db.subjects });
});

// Create subject (admin)
router.post("/subjects", isAdmin, express.json(), async (req, res) => {
  const name = (req.body?.name || "").trim();
  if (!name) return res.status(400).json({ success: false, message: "Name required" });

  const db = await readDB();
  const id = name.toLowerCase().replace(/\s+/g, "-") || uid();
  if (db.subjects.find((s) => s.id === id)) {
    return res.status(409).json({ success: false, message: "Subject already exists" });
  }
  const subject = { id, name, chapters: [] };
  db.subjects.push(subject);
  await writeDB(db);
  res.json({ success: true, subject });
});

// Add chapter (file OR external URL) (admin)
router.post("/subjects/:sid/chapters", isAdmin, uploadChapter, async (req, res) => {
  try {
    const db = await readDB();
    const sub = db.subjects.find((s) => s.id === req.params.sid);
    if (!sub) return res.status(404).json({ success: false, message: "Subject not found" });

    const file = req.files?.pdf?.[0] || req.files?.file?.[0] || null;
    const external = String(req.body?.url || "").trim();

    if (!file && !external) {
      return res.status(400).json({ success: false, message: "Provide a PDF file or external URL" });
    }

    const title = String(req.body.title || "Untitled").slice(0, 200);
    const locked = req.body.locked === "true" || req.body.locked === true;

    let url;
    if (file) {
      url = mongoURI ? `/api/gridfs/pdf/${file.filename}` : `/uploads/pdfs/${file.filename}`;
    } else {
      try {
        const u = new URL(external);
        if (!/^https?:$/i.test(u.protocol)) throw new Error("Only http/https allowed");
        url = external;
      } catch {
        return res.status(400).json({ success: false, message: "Invalid external URL" });
      }
    }

    const ch = { id: uid(), title, url, locked, createdAt: new Date().toISOString() };
    sub.chapters.push(ch);
    await writeDB(db);
    res.json({ success: true, chapter: ch });
  } catch (err) {
    console.error("⚠️ Chapter upload error:", err);
    res.status(500).json({ success: false, message: err.message || "Server error" });
  }
});

// Delete chapter (admin)
router.delete("/subjects/:sid/chapters/:cid", isAdmin, async (req, res) => {
  const db = await readDB();
  const sub = db.subjects.find((s) => s.id === req.params.sid);
  if (!sub) return res.status(404).json({ success: false, message: "Subject not found" });

  const idx = sub.chapters.findIndex((c) => c.id === req.params.cid);
  if (idx < 0) return res.status(404).json({ success: false, message: "Chapter not found" });

  const removed = sub.chapters.splice(idx, 1)[0];

  // Clean GridFS file if used
  if (mongoURI && removed?.url?.includes("/api/gridfs/pdf/")) {
    const filename = removed.url.split("/").pop();
    try {
      if (mongoose.connection.readyState === 1) {
        const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "pdfs" });
        const files = await mongoose.connection.db.collection("pdfs.files").find({ filename }).toArray();
        if (files.length) await bucket.delete(files[0]._id);
      }
    } catch (e) {
      console.error("GridFS delete warn:", e?.message || e);
    }
  }

  await writeDB(db);
  res.json({ success: true, removed });
});

// Delete subject (admin)
router.delete("/subjects/:sid", isAdmin, async (req, res) => {
  const db = await readDB();
  const idx = db.subjects.findIndex((s) => s.id === req.params.sid);
  if (idx < 0) return res.status(404).json({ success: false, message: "Subject not found" });

  const sub = db.subjects[idx];
  if (mongoURI && mongoose.connection.readyState === 1) {
    try {
      const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "pdfs" });
      for (const ch of sub.chapters || []) {
        if (ch.url?.includes("/api/gridfs/pdf/")) {
          const filename = ch.url.split("/").pop();
          const files = await mongoose.connection.db.collection("pdfs.files").find({ filename }).toArray();
          if (files.length) await bucket.delete(files[0]._id);
        }
      }
    } catch (e) {
      console.error("GridFS subject delete warn:", e?.message || e);
    }
  }
  db.subjects.splice(idx, 1);
  await writeDB(db);
  res.json({ success: true });
});

// Toggle lock (admin)
router.patch("/subjects/:sid/chapters/:cid/lock", isAdmin, express.json({ limit: "5mb" }), async (req, res) => {
  const db = await readDB();
  const sub = db.subjects.find((s) => s.id === req.params.sid);
  const ch = sub?.chapters.find((c) => c.id === req.params.cid);
  if (!ch) return res.status(404).json({ success: false, message: "Chapter not found" });
  ch.locked = !!req.body.locked;
  await writeDB(db);
  res.json({ success: true, chapter: ch });
});

// ORB/CORS-safe proxy for R2 PDF links
router.get("/stream", async (req, res) => {
  try {
    const src = String(req.query.src || "").trim();
    if (!src) return res.status(400).send("Missing src");

    // Allow only your configured public base (or pub-*.r2.dev fallback)
    const allowed =
      (R2_PUBLIC_BASE && src.startsWith(R2_PUBLIC_BASE + "/")) ||
      /^https:\/\/pub-[a-z0-9-]+\.r2\.dev\//i.test(src);
    if (!allowed) return res.status(400).send("Blocked src");

    const range = req.headers.range;
    const upstream = await fetch(src, { headers: range ? { Range: range } : {} });

    const status = upstream.status; // 200/206
    const headers = {
      "Content-Type": upstream.headers.get("content-type") || "application/pdf",
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-transform, public, max-age=86400",
      "Access-Control-Expose-Headers": "Content-Length,Content-Range,Accept-Ranges",
      "Cross-Origin-Resource-Policy": "cross-origin",
      "Content-Disposition": 'inline; filename="document.pdf"',
    };
    const contentLength = upstream.headers.get("content-length");
    if (contentLength) headers["Content-Length"] = contentLength;
    const contentRange = upstream.headers.get("content-range");
    if (contentRange) headers["Content-Range"] = contentRange;

    res.writeHead(status === 206 ? 206 : 200, headers);
    if (!upstream.body) return res.end();

    const { Readable } = await import("node:stream");
    Readable.fromWeb(upstream.body).on("error", () => {
      try { res.end(); } catch {}
    }).pipe(res);
  } catch (err) {
    console.error("pdf proxy failed:", err);
    if (!res.headersSent) res.status(502).send("Upstream error");
    else try { res.end(); } catch {}
  }
});

// Error handler
router.use((err, _req, res, _next) => {
  console.error("PDFs route error:", err);
  res.status(err.status || 500).json({ success: false, message: err.message || "Server error" });
});

export default router;
