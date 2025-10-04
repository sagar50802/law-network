// server/routes/pdfs.js
import express from "express";
import multer from "multer";
import path from "path";
import fsp from "fs/promises";
import { fileURLToPath } from "url";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import isOwner from "../middlewares/isOwnerWrapper.js";

const router = express.Router();

/* ------------ Paths & tiny helpers ------------ */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ROOT = path.join(process.cwd(), "server");
const DATA_DIR = path.join(ROOT, "data");
const DB_FILE = path.join(DATA_DIR, "pdfs.json");
await fsp.mkdir(DATA_DIR, { recursive: true }).catch(() => {});

const LOCAL_DIR = path.join(ROOT, "uploads", "pdfs");
await fsp.mkdir(LOCAL_DIR, { recursive: true }).catch(() => {});

const newId = () =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const safeName = (s) =>
  String(s || "")
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "_")
    .slice(0, 120);

/* ------------ Cloudflare R2 ------------ */
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "";
const R2_BUCKET = process.env.R2_BUCKET || "lawprepx";
const R2_PUBLIC_BASE = (process.env.R2_PUBLIC_BASE || "").replace(/\/+$/, "");
const REQUIRE_R2 = String(process.env.PDFS_REQUIRE_R2 || "false").toLowerCase() === "true";

// we’ll keep the index alongside your objects in R2
const R2_DB_KEY = process.env.R2_PDFS_INDEX_KEY || "data/pdfs.json";

const r2Ready =
  !!R2_ACCOUNT_ID &&
  !!R2_ACCESS_KEY_ID &&
  !!R2_SECRET_ACCESS_KEY &&
  !!R2_PUBLIC_BASE;

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

/* ------------ helpers for index persistence ------------ */
async function bodyToString(body) {
  // AWS SDK v3 in Node returns a Readable. Some runtimes support transformToString.
  if (body && typeof body.transformToString === "function") {
    return await body.transformToString();
  }
  return await new Promise((resolve, reject) => {
    const chunks = [];
    body.on("data", (c) => chunks.push(Buffer.from(c)));
    body.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    body.on("error", reject);
  });
}

async function readDB() {
  // Prefer R2 copy (persistent), fall back to local file, else empty
  if (r2Ready) {
    try {
      const obj = await s3.send(
        new GetObjectCommand({ Bucket: R2_BUCKET, Key: R2_DB_KEY })
      );
      const raw = await bodyToString(obj.Body);
      const json = JSON.parse(raw || "{}");
      json.subjects ||= [];
      // also hydrate local copy for quick reads
      await fsp.writeFile(DB_FILE, JSON.stringify(json, null, 2), "utf8");
      return json;
    } catch {
      // ignore and fall through to local
    }
  }
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
  const str = JSON.stringify(db, null, 2);
  await fsp.writeFile(DB_FILE, str, "utf8"); // local (in case R2 temporarily down)
  if (r2Ready) {
    try {
      await s3.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: R2_DB_KEY,
          Body: str,
          ContentType: "application/json",
          CacheControl: "no-cache",
          ContentDisposition: 'inline; filename="pdfs.json"',
        })
      );
    } catch (e) {
      console.warn("⚠️ Failed to persist pdfs.json to R2:", e?.message || e);
    }
  }
}

/* ------------ Multer (memory) ------------ */
const upload = multer({ storage: multer.memoryStorage() });
const pickUploaded = (req) =>
  req.files?.pdf?.[0] || req.files?.file?.[0] || req.file || null;

/* ------------ DB routes ------------ */

// List (public)
router.get("/", async (_req, res) => {
  const db = await readDB();
  res.json({ success: true, subjects: db.subjects });
});

// Create subject
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
  const id = name.toLowerCase().replace(/\s+/g, "-") || newId();

  const existing =
    db.subjects.find(
      (s) =>
        s.id === id || String(s.name).toLowerCase() === name.toLowerCase()
    ) || null;
  if (existing) return res.status(200).json({ success: true, subject: existing });

  const subject = { id, name, chapters: [] };
  db.subjects.push(subject);
  await writeDB(db);
  res.json({ success: true, subject });
});

// Add chapter (file or URL)
router.post(
  "/subjects/:sid/chapters",
  isOwner,
  upload.fields([
    { name: "pdf", maxCount: 1 },
    { name: "file", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      if (!r2Ready && REQUIRE_R2) {
        return res
          .status(503)
          .json({ success: false, message: "Storage is not configured (R2 required)" });
      }

      const db = await readDB();
      const sub = db.subjects.find((s) => s.id === req.params.sid);
      if (!sub)
        return res.status(404).json({ success: false, message: "Subject not found" });

      const title = String(req.body?.title || "Untitled").slice(0, 200);
      const locked = String(req.body?.locked) === "true" || req.body?.locked === true;
      const urlFromBody = String(req.body?.url || req.body?.pdfUrl || req.query?.url || "").trim();

      let finalUrl = "";
      const file = pickUploaded(req);

      if (file && file.buffer) {
        if (!file.buffer.length || file.buffer.length < 100) {
          return res.status(400).json({ success: false, message: "PDF looks empty/corrupt" });
        }
        const ext = path.extname(file.originalname || ".pdf") || ".pdf";
        const key = `pdfs/${sub.id}/${Date.now()}_${newId()}${ext}`;

        if (r2Ready) {
          await s3.send(
            new PutObjectCommand({
              Bucket: R2_BUCKET,
              Key: key,
              Body: file.buffer,
              ContentType: "application/pdf",
              CacheControl: "public, max-age=31536000, immutable",
              ContentDisposition: `inline; filename="${safeName(file.originalname || "document.pdf")}"`,
            })
          );
          finalUrl = `${R2_PUBLIC_BASE}/${key}`;
        } else {
          const dir = path.join(LOCAL_DIR, sub.id);
          await fsp.mkdir(dir, { recursive: true });
          const localName = safeName(`${Date.now()}_${newId()}${ext}`);
          await fsp.writeFile(path.join(dir, localName), file.buffer);
          finalUrl = `/uploads/pdfs/${sub.id}/${localName}`;
        }
      } else if (urlFromBody) {
        finalUrl = urlFromBody;
      } else {
        return res.status(400).json({ success: false, message: "PDF file or URL required" });
      }

      const chapter = {
        id: newId(),
        title,
        url: finalUrl,
        locked,
        createdAt: new Date().toISOString(),
      };
      sub.chapters.push(chapter);
      await writeDB(db);
      res.json({ success: true, chapter });
    } catch (err) {
      console.error("PDF chapter upload failed:", err);
      res.status(500).json({ success: false, message: err?.message || "Server error" });
    }
  }
);

// Delete chapter
router.delete("/subjects/:sid/chapters/:cid", isOwner, async (req, res) => {
  const db = await readDB();
  const sub = db.subjects.find((s) => s.id === req.params.sid);
  if (!sub) return res.status(404).json({ success: false, message: "Subject not found" });

  const idx = sub.chapters.findIndex((c) => c.id === req.params.cid);
  if (idx < 0) return res.status(404).json({ success: false, message: "Chapter not found" });

  const removed = sub.chapters.splice(idx, 1)[0];

  if (r2Ready && removed?.url?.startsWith(R2_PUBLIC_BASE + "/")) {
    try {
      const base = new URL(R2_PUBLIC_BASE);
      const u = new URL(removed.url);
      let key = u.pathname;
      if (base.pathname !== "/" && key.startsWith(base.pathname)) key = key.slice(base.pathname.length);
      key = key.replace(/^\/+/, "");
      if (key) await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    } catch (e) {
      console.warn("R2 delete warning:", e?.message || e);
    }
  }
  if (removed?.url?.startsWith("/uploads/")) {
    const abs = path.join(ROOT, removed.url.replace(/^\/+/, ""));
    fsp.unlink(abs).catch(() => {});
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
  for (const ch of sub.chapters || []) {
    if (r2Ready && ch?.url?.startsWith(R2_PUBLIC_BASE + "/")) {
      try {
        const base = new URL(R2_PUBLIC_BASE);
        const u = new URL(ch.url);
        let key = u.pathname;
        if (base.pathname !== "/" && key.startsWith(base.pathname)) key = key.slice(base.pathname.length);
        key = key.replace(/^\/+/, "");
        if (key) await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
      } catch (e) {
        console.warn("R2 delete warning:", e?.message || e);
      }
    }
    if (ch?.url?.startsWith("/uploads/")) {
      const abs = path.join(ROOT, ch.url.replace(/^\/+/, ""));
      fsp.unlink(abs).catch(() => {});
    }
  }
  db.subjects.splice(idx, 1);
  await writeDB(db);
  res.json({ success: true });
});

// Toggle lock
router.patch(
  "/subjects/:sid/chapters/:cid/lock",
  isOwner,
  express.json({ limit: "2mb" }),
  async (req, res) => {
    const db = await readDB();
    const sub = db.subjects.find((s) => s.id === req.params.sid);
    const ch = sub?.chapters.find((c) => c.id === req.params.cid);
    if (!ch) return res.status(404).json({ success: false, message: "Chapter not found" });
    ch.locked = !!req.body.locked;
    await writeDB(db);
    res.json({ success: true, chapter: ch });
  }
);

/* ------------ Strong /pdfs/stream (always via server) ------------ */
router.get("/stream", async (req, res) => {
  try {
    let src = String(req.query.src || "").trim();
    if (!src) return res.status(400).send("Missing src");
    if (!/^https?:\/\//i.test(src)) {
      const origin = `${req.protocol}://${req.get("host")}`;
      src = new URL(src, origin).toString();
    }

    const range = req.headers.range;
    const sendPdfHeaders = (status, extra = {}) => {
      res.writeHead(status, {
        "Content-Type": "application/pdf",
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-transform, public, max-age=86400",
        "Access-Control-Expose-Headers": "Content-Length,Content-Range,Accept-Ranges",
        "Cross-Origin-Resource-Policy": "cross-origin",
        "Content-Disposition": 'inline; filename="document.pdf"',
        Vary: "Range",
        ...extra,
      });
    };

    const tryR2Direct = async () => {
      if (!r2Ready || !R2_PUBLIC_BASE) return false;
      const base = new URL(R2_PUBLIC_BASE);
      const u = new URL(src);
      if (u.host !== base.host) return false;

      let key = u.pathname;
      if (base.pathname !== "/" && key.startsWith(base.pathname)) key = key.slice(base.pathname.length);
      key = key.replace(/^\/+/, "");
      if (!key) return false;

      const obj = await s3.send(
        new GetObjectCommand({
          Bucket: R2_BUCKET,
          Key: key,
          Range: range,
        })
      );

      const status = obj.ContentRange ? 206 : 200;
      const extra = {};
      if (obj.ContentLength != null) extra["Content-Length"] = String(obj.ContentLength);
      if (obj.ContentRange) extra["Content-Range"] = obj.ContentRange;

      sendPdfHeaders(status, extra);
      obj.Body.on("error", () => { try { res.end(); } catch {} }).pipe(res);
      return true;
    };

    if (await tryR2Direct()) return;

    const headers = range ? { Range: range } : {};
    const upstream = await fetch(src, { headers });
    const status = upstream.status === 206 ? 206 : upstream.status;

    if (status === 200 || status === 206) {
      const extra = {};
      const len = upstream.headers.get("content-length");
      const cr = upstream.headers.get("content-range");
      if (len) extra["Content-Length"] = len;
      if (cr) extra["Content-Range"] = cr;
      sendPdfHeaders(status, extra);

      if (!upstream.body) return res.end();
      const { Readable } = await import("node:stream");
      Readable.fromWeb(upstream.body)
        .on("error", () => { try { res.end(); } catch {} })
        .pipe(res);
      return;
    }

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

/* ------------ Error handler ------------ */
router.use((err, _req, res, _next) => {
  console.error("PDFs route error:", err);
  res
    .status(err.status || 500)
    .json({ success: false, message: err.message || "Server error" });
});

export default router;
