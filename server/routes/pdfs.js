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

/* ---------------- Paths & helpers ---------------- */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// JSON “db” on disk for subjects/chapters
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

// local uploads fallback
const LOCAL_DIR = path.join(ROOT, "uploads", "pdfs");
await fsp.mkdir(LOCAL_DIR, { recursive: true }).catch(() => {});

const newId = () =>
  Math.random().toString(36).slice(2, 10) + Date.now().toString(36);

const safeName = (s) =>
  String(s || "")
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "_")
    .slice(0, 120);

/* ---------------- Cloudflare R2 ---------------- */
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "";
const R2_BUCKET = process.env.R2_BUCKET || "lawprepx";
const R2_PUBLIC_BASE = (process.env.R2_PUBLIC_BASE || "").replace(/\/+$/, "");

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

/* ---------------- Multer (memory) ---------------- */
const upload = multer({ storage: multer.memoryStorage() });

/* ---------------- Routes ---------------- */

// List all subjects (public)
router.get("/", async (_req, res) => {
  const db = await readDB();
  res.json({ success: true, subjects: db.subjects });
});

// Create subject (admin)
// Accept name from body or query; id is a slug of the name
router.post("/subjects", isOwner, express.json(), async (req, res) => {
  const name = String(
    req.body?.name ||
      req.body?.subjectName ||
      req.query?.name ||
      req.query?.subjectName ||
      ""
  ).trim();

  if (!name) {
    return res.status(400).json({ success: false, message: "Name required" });
  }

  const db = await readDB();
  const id = name.toLowerCase().replace(/\s+/g, "-") || newId();

  const existing =
    db.subjects.find(
      (s) =>
        s.id === id || String(s.name).toLowerCase() === name.toLowerCase()
    ) || null;

  if (existing) {
    // idempotent: return existing
    return res.status(200).json({ success: true, subject: existing });
  }

  const subject = { id, name, chapters: [] };
  db.subjects.push(subject);
  await writeDB(db);
  res.json({ success: true, subject });
});

// Add chapter (admin)
// Accept uploaded file ("pdf") OR direct URL ("url"/"pdfUrl")
router.post(
  "/subjects/:sid/chapters",
  isOwner,
  upload.single("pdf"),
  async (req, res) => {
    try {
      const db = await readDB();
      const sub = db.subjects.find((s) => s.id === req.params.sid);
      if (!sub)
        return res
          .status(404)
          .json({ success: false, message: "Subject not found" });

      const title = String(req.body?.title || "Untitled").slice(0, 200);
      const locked =
        String(req.body?.locked) === "true" || req.body?.locked === true;

      const urlFromBody = String(
        req.body?.url || req.body?.pdfUrl || req.query?.url || ""
      ).trim();

      let finalUrl = "";

      if (req.file && req.file.buffer) {
        // file upload path/key
        const ext = path.extname(req.file.originalname || ".pdf") || ".pdf";
        const key = `pdfs/${sub.id}/${Date.now()}_${newId()}${ext}`;

        if (r2Ready) {
          await s3.send(
            new PutObjectCommand({
              Bucket: R2_BUCKET,
              Key: key,
              Body: req.file.buffer,
              ContentType: "application/pdf",
            })
          );
          finalUrl = `${R2_PUBLIC_BASE}/${key}`;
        } else {
          // local fallback
          const dir = path.join(LOCAL_DIR, sub.id);
          await fsp.mkdir(dir, { recursive: true });
          const localName = safeName(`${Date.now()}_${newId()}${ext}`);
          const abs = path.join(dir, localName);
          await fsp.writeFile(abs, req.file.buffer);
          finalUrl = `/uploads/pdfs/${sub.id}/${localName}`;
        }
      } else if (urlFromBody) {
        finalUrl = urlFromBody;
      } else {
        return res
          .status(400)
          .json({ success: false, message: "PDF file or URL required" });
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
      res
        .status(500)
        .json({ success: false, message: err?.message || "Server error" });
    }
  }
);

// Delete chapter (admin) + best-effort file removal
router.delete(
  "/subjects/:sid/chapters/:cid",
  isOwner,
  async (req, res) => {
    const db = await readDB();
    const sub = db.subjects.find((s) => s.id === req.params.sid);
    if (!sub)
      return res
        .status(404)
        .json({ success: false, message: "Subject not found" });

    const idx = sub.chapters.findIndex((c) => c.id === req.params.cid);
    if (idx < 0)
      return res
        .status(404)
        .json({ success: false, message: "Chapter not found" });

    const removed = sub.chapters.splice(idx, 1)[0];

    // delete from R2 if it was an R2 object
    if (r2Ready && removed?.url?.startsWith(R2_PUBLIC_BASE + "/")) {
      const key = removed.url.substring(R2_PUBLIC_BASE.length + 1);
      try {
        await s3.send(
          new DeleteObjectCommand({
            Bucket: R2_BUCKET,
            Key: key,
          })
        );
      } catch (e) {
        console.warn("R2 delete warning:", e?.message || e);
      }
    }

    // local delete if it was in /uploads
    if (removed?.url?.startsWith("/uploads/")) {
      const abs = path.join(ROOT, removed.url.replace(/^\/+/, ""));
      fsp.unlink(abs).catch(() => {});
    }

    await writeDB(db);
    res.json({ success: true, removed });
  }
);

// Delete an entire subject (admin) + cleanup files
router.delete("/subjects/:sid", isOwner, async (req, res) => {
  const db = await readDB();
  const idx = db.subjects.findIndex((s) => s.id === req.params.sid);
  if (idx < 0)
    return res
      .status(404)
      .json({ success: false, message: "Subject not found" });

  const sub = db.subjects[idx];

  // cleanup all chapter files
  for (const ch of sub.chapters || []) {
    if (r2Ready && ch?.url?.startsWith(R2_PUBLIC_BASE + "/")) {
      const key = ch.url.substring(R2_PUBLIC_BASE.length + 1);
      try {
        await s3.send(
          new DeleteObjectCommand({
            Bucket: R2_BUCKET,
            Key: key,
          })
        );
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

// Toggle lock/unlock (admin)
router.patch(
  "/subjects/:sid/chapters/:cid/lock",
  isOwner,
  express.json({ limit: "2mb" }),
  async (req, res) => {
    const db = await readDB();
    const sub = db.subjects.find((s) => s.id === req.params.sid);
    const ch = sub?.chapters.find((c) => c.id === req.params.cid);
    if (!ch)
      return res
        .status(404)
        .json({ success: false, message: "Chapter not found" });
    ch.locked = !!req.body.locked;
    await writeDB(db);
    res.json({ success: true, chapter: ch });
  }
);

/* ---------------- CORS/ORB-safe PDF proxy with R2 fallback ---------------- */
router.get("/stream", async (req, res) => {
  try {
    const src = String(req.query.src || "").trim();
    if (!src) return res.status(400).send("Missing src");

    const range = req.headers.range;
    const fetchHeaders = range ? { Range: range } : {};
    let upstream = await fetch(src, { headers: fetchHeaders });

    const ct = (upstream.headers && upstream.headers.get("content-type")) || "";
    const ok = upstream.status === 200 || upstream.status === 206;
    const looksPdf = /\bapplication\/pdf\b/i.test(ct);

    const tryR2 = async () => {
      if (!r2Ready) return null;
      if (!src.startsWith(R2_PUBLIC_BASE + "/")) return null;
      const key = src.substring(R2_PUBLIC_BASE.length + 1);

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
        "Cache-Control":
          obj.CacheControl || "no-transform, public, max-age=86400",
        "Access-Control-Expose-Headers":
          "Content-Length,Content-Range,Accept-Ranges",
        "Cross-Origin-Resource-Policy": "cross-origin",
        "Content-Disposition":
          obj.ContentDisposition || 'inline; filename="document.pdf"',
        Vary: "Range",
      };
      if (obj.ContentLength != null)
        headers["Content-Length"] = String(obj.ContentLength);
      if (obj.ContentRange) headers["Content-Range"] = obj.ContentRange;

      res.writeHead(status, headers);
      obj.Body.on("error", () => {
        try {
          res.end();
        } catch {}
      }).pipe(res);
      return true;
    };

    // 1) If upstream looks like a proper PDF stream, proxy it
    if (ok && looksPdf) {
      const headers = {
        "Content-Type": ct || "application/pdf",
        "Accept-Ranges": "bytes",
        "Cache-Control": "no-transform, public, max-age=86400",
        "Access-Control-Expose-Headers":
          "Content-Length,Content-Range,Accept-Ranges",
        "Cross-Origin-Resource-Policy": "cross-origin",
        "Content-Disposition": 'inline; filename="document.pdf"',
        Vary: "Range",
      };
      const len = upstream.headers.get("content-length");
      if (len) headers["Content-Length"] = len;
      const cr = upstream.headers.get("content-range");
      if (cr) headers["Content-Range"] = cr;

      res.writeHead(upstream.status, headers);
      if (!upstream.body) return res.end();
      const { Readable } = await import("node:stream");
      Readable.fromWeb(upstream.body)
        .on("error", () => {
          try {
            res.end();
          } catch {}
        })
        .pipe(res);
      return;
    }

    // 2) If upstream not OK, or it's HTML/text, try authenticated R2
    try {
      const handled = await tryR2();
      if (handled) return;
    } catch (e) {
      console.warn("R2 fallback failed:", e?.message || e);
    }

    // 3) Forward upstream error (as text) so pdf.js doesn't try to parse HTML as PDF
    const text = await upstream.text().catch(() => "Upstream error");
    res.set({
      "Content-Type": "text/plain; charset=utf-8",
      "Access-Control-Expose-Headers":
        "Content-Length,Content-Range,Accept-Ranges",
      "Cross-Origin-Resource-Policy": "cross-origin",
    });
    res.status(upstream.status || 502).send(text);
  } catch (e) {
    console.error("pdf stream proxy failed:", e);
    if (!res.headersSent) res.status(502).send("Upstream error");
    else try {
      res.end();
    } catch {}
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
