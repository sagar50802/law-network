// server/routes/articles.js  (ESM, R2 + GridFS fallback)
import express from "express";
import multer from "multer";
import mongoose from "mongoose";
import path from "path";
import crypto from "crypto";
import { isAdmin } from "./utils.js";
import * as ArticleModel from "../models/Article.js";

// ---- Model (compat with CJS/ESM default) ----
const Article = ArticleModel.default || ArticleModel;
const router = express.Router();

// ---- Upload (keeps your field name = "image") ----
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
});

const safeName = (orig = "file") =>
  String(orig).replace(/\s+/g, "_").replace(/[^\w.\-]/g, "");

// ---- GridFS helpers (backward compatibility) ----
const grid = (bucketName) => {
  const db = mongoose.connection?.db;
  return db ? new mongoose.mongo.GridFSBucket(db, { bucketName }) : null;
};
const fileUrl = (bucketName, id) => (id ? `/api/files/${bucketName}/${String(id)}` : "");
const idFromUrl = (url = "", expectedBucket) => {
  const m = String(url).match(/^\/api\/files\/([^/]+)\/([a-f0-9]{24})$/i);
  if (!m) return null;
  return expectedBucket && m[1] !== expectedBucket ? null : m[2];
};
async function gridPut(bucketName, file) {
  const b = grid(bucketName);
  if (!b) throw Object.assign(new Error("DB not connected"), { status: 503 });
  return await new Promise((resolve, reject) => {
    const ws = b.openUploadStream(safeName(file.originalname || "file"), {
      contentType: file.mimetype || "application/octet-stream",
      metadata: { bucket: bucketName },
    });
    ws.on("error", reject);
    ws.on("finish", () => resolve(ws.id));
    ws.end(file.buffer);
  });
}
async function gridDel(bucketName, id) {
  const b = grid(bucketName);
  if (!b || !id) return;
  try {
    await b.delete(new mongoose.Types.ObjectId(id));
  } catch {}
}

// ---- Cloudflare R2 (persistent store) ----
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "";
const R2_BUCKET = process.env.R2_BUCKET || "";
const R2_PUBLIC_BASE = (process.env.R2_PUBLIC_BASE || "").replace(/\/+$/, "");

const r2Ready =
  !!R2_ACCOUNT_ID &&
  !!R2_ACCESS_KEY_ID &&
  !!R2_SECRET_ACCESS_KEY &&
  !!R2_BUCKET &&
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

const r2KeyFromUrl = (url) => {
  try {
    const base = new URL(R2_PUBLIC_BASE);
    const u = new URL(url);
    if (u.host !== base.host) return "";
    let key = u.pathname;
    if (base.pathname !== "/" && key.startsWith(base.pathname)) {
      key = key.slice(base.pathname.length);
    }
    return key.replace(/^\/+/, "");
  } catch {
    return "";
  }
};

async function r2Put(file) {
  const ext = path.extname(file.originalname || "") || ".jpg";
  const key = `articles/${Date.now()}_${crypto.randomBytes(6).toString("hex")}${ext}`;
  await s3.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype || "application/octet-stream",
      CacheControl: "public, max-age=31536000, immutable",
      ContentDisposition: `inline; filename="${safeName(file.originalname || "image")}"`,
    })
  );
  return `${R2_PUBLIC_BASE}/${key}`;
}

async function r2DelByUrl(url) {
  if (!r2Ready) return;
  const key = r2KeyFromUrl(url);
  if (!key) return;
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  } catch {}
}

function isR2Url(url = "") {
  try {
    return !!R2_PUBLIC_BASE && new URL(url).host === new URL(R2_PUBLIC_BASE).host;
  } catch {
    return false;
  }
}

/* ---------------- ROUTES ---------------- */

// List (public)
router.get("/", async (_req, res) => {
  try {
    const items = await Article.find({}).sort({ createdAt: -1 }).lean();
    res.json({ success: true, items });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Create (admin) – supports file upload OR imageUrl
router.post("/", isAdmin, upload.single("image"), async (req, res) => {
  try {
    const {
      title,
      content = "",
      link = "",
      allowHtml = "false",
      isFree = "false",
      imageUrl = "",
    } = req.body;

    if (!title) {
      return res.status(400).json({ success: false, error: "Title required" });
    }

    let image = "";
    if (req.file?.buffer?.length) {
      // Prefer R2; fallback to GridFS if R2 is not configured
      image = r2Ready ? await r2Put(req.file) : fileUrl("articles", await gridPut("articles", req.file));
    } else if (imageUrl && imageUrl.trim()) {
      image = imageUrl.trim();
    }

    const doc = await Article.create({
      title,
      content,
      link,
      allowHtml: String(allowHtml) === "true",
      isFree: String(isFree) === "true",
      image,
    });

    res.json({ success: true, item: doc });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// Update (admin) – replace image if new file or imageUrl provided
router.patch("/:id", isAdmin, upload.single("image"), async (req, res) => {
  try {
    const prev = await Article.findById(req.params.id);
    if (!prev) return res.status(404).json({ success: false, error: "Not found" });

    const patch = {
      ...(req.body.title != null ? { title: req.body.title } : {}),
      ...(req.body.content != null ? { content: req.body.content } : {}),
      ...(req.body.link != null ? { link: req.body.link } : {}),
      ...(req.body.allowHtml != null ? { allowHtml: String(req.body.allowHtml) === "true" } : {}),
      ...(req.body.isFree != null ? { isFree: String(req.body.isFree) === "true" } : {}),
    };

    // Replace image with uploaded file
    if (req.file?.buffer?.length) {
      // delete previous stored image if it was ours
      if (isR2Url(prev.image)) await r2DelByUrl(prev.image);
      const oldGridId = idFromUrl(prev.image, "articles");
      if (oldGridId) await gridDel("articles", oldGridId);

      patch.image = r2Ready
        ? await r2Put(req.file)
        : fileUrl("articles", await gridPut("articles", req.file));
    }

    // Or replace image via direct URL (if provided)
    if (req.body.imageUrl != null && String(req.body.imageUrl).trim() !== "") {
      if (isR2Url(prev.image)) await r2DelByUrl(prev.image);
      const oldGridId = idFromUrl(prev.image, "articles");
      if (oldGridId) await gridDel("articles", oldGridId);

      patch.image = String(req.body.imageUrl).trim();
    }

    const updated = await Article.findByIdAndUpdate(req.params.id, patch, {
      new: true,
    });
    res.json({ success: true, item: updated });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// Delete (admin) – also removes stored image
router.delete("/:id", isAdmin, async (req, res) => {
  try {
    const doc = await Article.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: "Not found" });

    if (isR2Url(doc.image)) await r2DelByUrl(doc.image);
    const oldGridId = idFromUrl(doc.image, "articles");
    if (oldGridId) await gridDel("articles", oldGridId);

    res.json({ success: true, removed: doc });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
