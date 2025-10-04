// server/routes/pdfs.js
import express from "express";
import multer from "multer";
import path, { extname } from "path";
import fsp from "fs/promises";
import dotenv from "dotenv";
import isOwner from "../middlewares/isOwnerWrapper.js";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

dotenv.config();

const router = express.Router();

/* ---------------- Paths / simple JSON DB ---------------- */
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
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

/* ---------------- Cloudflare R2 (primary) ---------------- */
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET || "lawprepx";
const R2_PUBLIC_BASE = (process.env.R2_PUBLIC_BASE || "").replace(/\/+$/, "");

const r2Ready =
  !!R2_ACCOUNT_ID && !!R2_ACCESS_KEY_ID && !!R2_SECRET_ACCESS_KEY && !!R2_PUBLIC_BASE;

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

/* ---------------- Multer (memory; we decide dest) ---------------- */
const uploadMem = multer({ storage: multer.memoryStorage() });
const uploadChapter = uploadMem.fields([
  { name: "pdf", maxCount: 1 },
  { name: "file", maxCount: 1 },
]);

/* ---------------- Helpers ---------------- */
function guessPdfMime(name = "") {
  const lc = String(name).toLowerCase();
  if (lc.endsWith(".pdf")) return "application/pdf";
  return "application/pdf";
}
function ok(res, obj) {
  if (obj && obj.subjects) return res.json({ success: true, subjects: obj.subjects });
  return res.json({ success: true, ...obj });
}

/* ---------------- Routes ---------------- */

// Public list
router.get("/", async (_req, res) => {
  const db = await readDB();
  return ok(res, { subjects: db.subjects });
});

// Create subject (accept name via body OR query)
router.post("/subjects", isOwner, express.json(), async (req, res) => {
  const raw =
    req.body?.name ||
    req.body?.subjectName ||
    req.query?.name ||
    req.query?.subjectName ||
    "";
  const name = String(raw).trim();
  if (!name) return res.status(400).json({ success: false, message: "Name required" });

  const db = await readDB();
  const id = name.toLowerCase().replace(/\s+/g, "-") || uid();

  const existing = db.subjects.find(
    (s) => s.id === id || s.name.toLowerCase() === name.toLowerCase()
  );
  if (existing) return ok(res, { subject: existing });

  const subject = { id, name, chapters: [] };
  db.subjects.push(subject);
  await writeDB(db);
  return ok(res, { subject });
});

// Add chapter (file OR url)
router.post("/subjects/:sid/chapters", isOwner, uploadChapter, async (req, res) => {
  try {
    const db = await readDB();
    const sub = db.subjects.find((s) => s.id === req.params.sid);
    if (!sub) return res.status(404).json({ success: false, message: "Subject not found" });

    const file = req.files?.pdf?.[0] || req.files?.file?.[0] || null;
    const urlFromBody = String(req.body?.url || req.body?.pdfUrl || "").trim();

    if (!file && !urlFromBody) {
      return res.status(400).json({ success: false, message: "PDF file or URL required" });
    }

    const title = String(req.body?.title || "Untitled").slice(0, 200);
    const locked =
      String(req.body?.locked) === "true" || req.body?.locked === true ? true : false;

    let url = urlFromBody;

    if (file) {
      const ext = (extname(file.originalname) || ".pdf").toLowerCase();
      const key = `pdfs/${sub.id}/${Date.now()}_${uid()}${ext}`;

      if (r2Ready) {
        // Upload to R2
        await s3.send(
          new PutObjectCommand({
            Bucket: R2_BUCKET,
            Key: key,
            Body: file.buffer,
            ContentType: file.mimetype || guessPdfMime(file.originalname),
          })
        );
        url = `${R2_PUBLIC_BASE}/${key}`;
      } else {
        // Fallback: save to local disk
        const filename = `${Date.now()}_${uid()}${ext}`;
        const full = path.join(UPLOAD_DIR, filename);
        await fsp.writeFile(full, file.buffer);
        url = `/uploads/pdfs/${filename}`;
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
    return ok(res, { chapter: ch });
  } catch (err) {
    console.error("⚠️ PDF chapter upload error:", err);
    return res
      .status(500)
      .json({ success: false, message: err?.message || "Server error" });
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

  // Best-effort R2 cleanup
  try {
    if (r2Ready && removed?.url?.startsWith(R2_PUBLIC_BASE + "/")) {
      const key = removed.url.substring(R2_PUBLIC_BASE.length + 1);
      if (key) {
        await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
      }
    } else if (removed?.url?.startsWith("/uploads/pdfs/")) {
      const file = removed.url.replace(/^\/uploads\/pdfs\//, "");
      const full = path.join(UPLOAD_DIR, file);
      await fsp.unlink(full).catch(() => {});
    }
  } catch (e) {
    console.warn("PDF delete warning:", e?.message || e);
  }

  await writeDB(db);
  return ok(res, { success: true, removed });
});

// Delete subject (+ try to clean files)
router.delete("/subjects/:sid", isOwner, async (req, res) => {
  const db = await readDB();
  const idx = db.subjects.findIndex((s) => s.id === req.params.sid);
  if (idx < 0) return res.status(404).json({ success: false, message: "Subject not found" });

  const sub = db.subjects[idx];

  // Attempt cleanup
  for (const ch of sub.chapters || []) {
    try {
      if (r2Ready && ch?.url?.startsWith(R2_PUBLIC_BASE + "/")) {
        const key = ch.url.substring(R2_PUBLIC_BASE.length + 1);
        if (key) await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
      } else if (ch?.url?.startsWith("/uploads/pdfs/")) {
        const file = ch.url.replace(/^\/uploads\/pdfs\//, "");
        const full = path.join(UPLOAD_DIR, file);
        await fsp.unlink(full).catch(() => {});
      }
    } catch (e) {
      console.warn("PDF subject cleanup warning:", e?.message || e);
    }
  }

  db.subjects.splice(idx, 1);
  await writeDB(db);
  return ok(res, { success: true });
});

// Toggle lock
router.patch(
  "/subjects/:sid/chapters/:cid/lock",
  isOwner,
  express.json({ limit: "1mb" }),
  async (req, res) => {
    const db = await readDB();
    const sub = db.subjects.find((s) => s.id === req.params.sid);
    const ch = sub?.chapters.find((c) => c.id === req.params.cid);
    if (!ch) return res.status(404).json({ success: false, message: "Chapter not found" });

    ch.locked = !!req.body.locked;
    await writeDB(db);
    return ok(res, { chapter: ch });
  }
);

/* ---------------- CORS/ORB-safe PDF stream proxy ----------------
   Only proxies URLs under your R2 public base to avoid SSRF. */
router.get("/stream", async (req, res) => {
  try {
    const src = String(req.query.src || "").trim();
    if (!src) return res.status(400).send("Missing src");

    let url;
    try {
      url = new URL(src);
    } catch {
      return res.status(400).send("Invalid src");
    }

    // Security: allow only your R2 public domain
    if (!R2_PUBLIC_BASE || !src.startsWith(R2_PUBLIC_BASE + "/")) {
      return res.status(400).send("Blocked src");
    }

    const range = req.headers.range;
    const upstream = await fetch(url, { headers: range ? { Range: range } : {} });

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
        try {
          res.end();
        } catch {}
      })
      .pipe(res);
  } catch (e) {
    console.error("pdf stream proxy failed:", e);
    if (!res.headersSent) res.status(502).send("Upstream error");
    else try { res.end(); } catch {}
  }
});

// Final error handler
router.use((err, _req, res, _next) => {
  console.error("PDFs route error:", err);
  res.status(err.status || 500).json({ success: false, message: err.message || "Server error" });
});

export default router;
