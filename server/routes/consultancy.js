// server/routes/consultancy.js  (ESM, R2 persistent + GridFS fallback)
import express from "express";
import multer from "multer";
import mongoose from "mongoose";
import path from "path";
import crypto from "crypto";
import { isAdmin } from "./utils.js";
import * as ConsultancyModel from "../models/Consultancy.js";

const Consultancy = ConsultancyModel.default || ConsultancyModel;
const router = express.Router();

/* ---------------- Upload (image + optional QR) ---------------- */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});
const safeName = (orig = "file") =>
  String(orig).replace(/\s+/g, "_").replace(/[^\w.\-]/g, "");

/* ---------------- GridFS helpers (fallback) ---------------- */
const grid = (bucketName) => {
  const db = mongoose.connection?.db;
  return db ? new mongoose.mongo.GridFSBucket(db, { bucketName }) : null;
};
const fileUrl = (bucketName, id) =>
  id ? `/api/files/${bucketName}/${String(id)}` : "";
const idFromUrl = (url = "", expectedBucket) => {
  const m = String(url).match(/^\/api\/files\/([^/]+)\/([a-f0-9]{24})$/i);
  if (!m) return null;
  return expectedBucket && m[1] !== expectedBucket ? null : m[2];
};
async function gridPut(bucketName, file) {
  const b = grid(bucketName);
  if (!b) throw Object.assign(new Error("DB not connected"), { status: 503 });
  return await new Promise((resolve, reject) => {
    const ws = b.openUploadStream(safeName(file.originalname || "image"), {
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
  try { await b.delete(new mongoose.Types.ObjectId(id)); } catch {}
}

/* ---------------- Cloudflare R2 (persistent store) ---------------- */
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
  } catch { return ""; }
};

async function r2Put(file, folder = "consultancy") {
  const ext = path.extname(file.originalname || "") || ".jpg";
  const key = `${folder}/${Date.now()}_${crypto.randomBytes(6).toString("hex")}${ext}`;
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
  try { await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key })); } catch {}
}
function isR2Url(url = "") {
  try { return !!R2_PUBLIC_BASE && new URL(url).host === new URL(R2_PUBLIC_BASE).host; }
  catch { return false; }
}

/* ---------------- ROUTES ---------------- */

// List (public)
router.get("/", async (_req, res) => {
  try {
    const items = await Consultancy.find({})
      .sort({ order: 1, createdAt: -1 })
      .lean();
    res.json({ success: true, items });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Create (admin) – accepts image + optional waqr + links
router.post(
  "/",
  isAdmin,
  upload.fields([{ name: "image", maxCount: 1 }, { name: "waqr", maxCount: 1 }]),
  async (req, res) => {
    try {
      const { title, subtitle = "", intro = "", order = 0 } = req.body;
      if (!title) return res.status(400).json({ success: false, error: "Title required" });

      const imageFile = req.files?.image?.[0] || null;
      if (!imageFile?.buffer?.length)
        return res.status(400).json({ success: false, error: "Image required" });

      const qrFile = req.files?.waqr?.[0] || null;

      // optional deep links
      const links = {
        whatsapp: (req.body.whatsapp || "").trim(),
        telegram: (req.body.telegram || "").trim(),
        instagram:(req.body.instagram || "").trim(),
        email:    (req.body.email || "").trim(),
        website:  (req.body.website || "").trim(),
      };

      const imageUrlStored = r2Ready
        ? await r2Put(imageFile, "consultancy")
        : fileUrl("consultancy", await gridPut("consultancy", imageFile));

      let whatsappQr = "";
      if (qrFile?.buffer?.length) {
        whatsappQr = r2Ready
          ? await r2Put(qrFile, "consultancy/qr")
          : fileUrl("consultancy_qr", await gridPut("consultancy_qr", qrFile));
      }

      const item = await Consultancy.create({
        title, subtitle, intro,
        order: Number(order || 0),
        image: imageUrlStored,
        whatsappQr,
        ...links,
      });

      res.json({ success: true, item });
    } catch (e) {
      res.status(e.status || 500).json({ success: false, error: e.message });
    }
  }
);

// Update (admin) – replace image/QR and/or update links
router.patch(
  "/:id",
  isAdmin,
  upload.fields([{ name: "image", maxCount: 1 }, { name: "waqr", maxCount: 1 }]),
  async (req, res) => {
    try {
      const prev = await Consultancy.findById(req.params.id);
      if (!prev) return res.status(404).json({ success: false, error: "Not found" });

      const patch = {
        ...(req.body.title != null ? { title: req.body.title } : {}),
        ...(req.body.subtitle != null ? { subtitle: req.body.subtitle } : {}),
        ...(req.body.intro != null ? { intro: req.body.intro } : {}),
        ...(req.body.order != null ? { order: Number(req.body.order) } : {}),

        // links (all optional)
        ...(req.body.whatsapp != null ? { whatsapp: String(req.body.whatsapp).trim() } : {}),
        ...(req.body.telegram  != null ? { telegram: String(req.body.telegram).trim() }  : {}),
        ...(req.body.instagram != null ? { instagram:String(req.body.instagram).trim() } : {}),
        ...(req.body.email     != null ? { email: String(req.body.email).trim() }     : {}),
        ...(req.body.website   != null ? { website: String(req.body.website).trim() }   : {}),
      };

      const newImage = req.files?.image?.[0] || null;
      const newQr    = req.files?.waqr?.[0] || null;

      if (newImage?.buffer?.length) {
        if (isR2Url(prev.image)) await r2DelByUrl(prev.image);
        const oldId = idFromUrl(prev.image, "consultancy");
        if (oldId) await gridDel("consultancy", oldId);

        patch.image = r2Ready
          ? await r2Put(newImage, "consultancy")
          : fileUrl("consultancy", await gridPut("consultancy", newImage));
      }

      if (newQr?.buffer?.length) {
        if (isR2Url(prev.whatsappQr)) await r2DelByUrl(prev.whatsappQr);
        const oldQrId = idFromUrl(prev.whatsappQr, "consultancy_qr");
        if (oldQrId) await gridDel("consultancy_qr", oldQrId);

        patch.whatsappQr = r2Ready
          ? await r2Put(newQr, "consultancy/qr")
          : fileUrl("consultancy_qr", await gridPut("consultancy_qr", newQr));
      }

      const updated = await Consultancy.findByIdAndUpdate(req.params.id, patch, { new: true });
      res.json({ success: true, item: updated });
    } catch (e) {
      res.status(e.status || 500).json({ success: false, error: e.message });
    }
  }
);

// Delete (admin) – also remove stored image/qr
router.delete("/:id", isAdmin, async (req, res) => {
  try {
    const doc = await Consultancy.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: "Not found" });

    if (isR2Url(doc.image)) await r2DelByUrl(doc.image);
    const fid = idFromUrl(doc.image, "consultancy"); if (fid) await gridDel("consultancy", fid);

    if (isR2Url(doc.whatsappQr)) await r2DelByUrl(doc.whatsappQr);
    const qid = idFromUrl(doc.whatsappQr, "consultancy_qr"); if (qid) await gridDel("consultancy_qr", qid);

    res.json({ success: true, removed: doc });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
