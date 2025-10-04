// server/routes/pdfs.js
import express from "express";
import multer from "multer";
import fsp from "fs/promises";
import path from "path";
import dotenv from "dotenv";
import isOwner from "../middlewares/isOwnerWrapper.js";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

dotenv.config();
const router = express.Router();

/* ---------- R2 config (same pattern as podcasts/videos) ---------- */
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET || "lawprepx";
const R2_PUBLIC_BASE = (process.env.R2_PUBLIC_BASE || "").replace(/\/+$/, "");
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

/* ---------- Tiny JSON “DB” on disk ---------- */
const ROOT = path.join(process.cwd(), "server");
const DATA_DIR = path.join(ROOT, "data");
const DB_FILE = path.join(DATA_DIR, "pdfs.json");
await fsp.mkdir(DATA_DIR, { recursive: true }).catch(() => {});
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

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

/* ---------- Multer (memory!) so we have file.buffer ---------- */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
});
const uploadChapter = upload.fields([
  { name: "pdf", maxCount: 1 },
  { name: "file", maxCount: 1 },
]);

/* ---------- Helpers ---------- */
const newId = () => Math.random().toString(36).slice(2, 10);
const guessPdfName = (orig = "") =>
  (orig || "file.pdf").replace(/\s+/g, "_").replace(/[^a-zA-Z0-9._-]/g, "") || "file.pdf";

/* ---------- Routes ---------- */

// Public list
router.get("/", async (_req, res) => {
  const db = await readDB();
  res.json({ success: true, subjects: db.subjects });
});

// Create subject (owner)
router.post("/subjects", isOwner, express.json(), async (req, res) => {
  const name = String(req.body?.name || req.body?.subjectName || req.query?.name || "").trim();
  if (!name) return res.status(400).json({ success: false, message: "Name required" });

  const db = await readDB();
  const id = name.toLowerCase().replace(/\s+/g, "-") || uid();

  const existing =
    db.subjects.find(
      (s) => s.id === id || (s.name || "").toLowerCase() === name.toLowerCase()
    ) || null;

  if (existing) return res.status(200).json({ success: true, subject: existing });

  const subject = { id, name, chapters: [] };
  db.subjects.push(subject);
  await writeDB(db);
  res.json({ success: true, subject });
});

// Add chapter (owner): file (pdf/file) OR direct URL
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
    const locked = String(req.body?.locked) === "true" || req.body?.locked === true;

    let url = urlFromBody;
    if (file) {
      if (!r2Ready) {
        return res.status(500).json({
          success: false,
          message: "R2 not configured. Set R2_ACCOUNT_ID/KEYS and R2_PUBLIC_BASE.",
        });
      }
      const safeName = guessPdfName(file.originalname);
      const key = `pdfs/${req.params.sid}/${Date.now()}_${newId()}_${safeName}`;
      await s3.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: key,
          Body: file.buffer,                 // <- real bytes
          ContentType: "application/pdf",    // <- correct mime
          CacheControl: "public, max-age=31536000, immutable",
          ContentDisposition: 'inline; filename="' + safeName + '"',
        })
      );
      url = `${R2_PUBLIC_BASE}/${key}`;
    }

    const chapter = { id: uid(), title, url, locked, createdAt: new Date().toISOString() };
    sub.chapters.push(chapter);
    await writeDB(db);
    res.json({ success: true, chapter });
  } catch (err) {
    console.error("⚠️ PDF chapter upload error:", err);
    res.status(500).json({ success: false, message: err.message || "Server error" });
  }
});

// Delete chapter (owner) — best-effort R2 cleanup
router.delete("/subjects/:sid/chapters/:cid", isOwner, async (req, res) => {
  const db = await readDB();
  const sub = db.subjects.find((s) => s.id === req.params.sid);
  if (!sub) return res.status(404).json({ success: false, message: "Subject not found" });

  const idx = sub.chapters.findIndex((c) => c.id === req.params.cid);
  if (idx < 0) return res.status(404).json({ success: false, message: "Chapter not found" });

  const removed = sub.chapters.splice(idx, 1)[0];
  if (r2Ready && removed?.url?.startsWith(R2_PUBLIC_BASE + "/")) {
    const key = removed.url.substring(R2_PUBLIC_BASE.length + 1);
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    } catch (e) {
      console.warn("R2 delete warning:", e?.message || e);
    }
  }
  await writeDB(db);
  res.json({ success: true, removed });
});

// Delete subject (owner) — best-effort R2 cleanup
router.delete("/subjects/:sid", isOwner, async (req, res) => {
  const db = await readDB();
  const idx = db.subjects.findIndex((s) => s.id === req.params.sid);
  if (idx < 0) return res.status(404).json({ success: false, message: "Subject not found" });

  const sub = db.subjects[idx];
  if (r2Ready) {
    for (const ch of sub.chapters || []) {
      if (ch.url?.startsWith(R2_PUBLIC_BASE + "/")) {
        const key = ch.url.substring(R2_PUBLIC_BASE.length + 1);
        try {
          await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
        } catch (e) {
          console.warn("R2 delete warning:", e?.message || e);
        }
      }
    }
  }
  db.subjects.splice(idx, 1);
  await writeDB(db);
  res.json({ success: true });
});

/* ---------- CORS/ORB-safe PDF stream proxy ---------- */
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
    Readable.fromWeb(upstream.body)
      .on("error", () => {
        try { res.end(); } catch {}
      })
      .pipe(res);
  } catch (e) {
    console.error("pdf stream proxy failed:", e);
    if (!res.headersSent) res.status(502).send("Upstream error");
    else try { res.end(); } catch {}
  }
});

/* ---------- Error handler ---------- */
router.use((err, _req, res, _next) => {
  console.error("PDFs route error:", err);
  res.status(err.status || 500).json({ success: false, message: err.message || "Server error" });
});

export default router;
