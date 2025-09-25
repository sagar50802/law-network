// server/routes/articles.js  (ESM, manual GridFS)
import express from "express";
import multer from "multer";
import mongoose from "mongoose";
import { isAdmin } from "./utils.js";
import * as ArticleModel from "../models/Article.js";

const Article = ArticleModel.default || ArticleModel;
const router = express.Router();

/* ---------------- helpers ---------------- */
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const bucket = (name) => {
  const db = mongoose.connection?.db;
  return db ? new mongoose.mongo.GridFSBucket(db, { bucketName: name }) : null;
};
const safeName = (orig = "file") =>
  String(orig).replace(/\s+/g, "_").replace(/[^\w.\-]/g, "");

const fileUrl = (bkt, id) => (id ? `/api/files/${bkt}/${String(id)}` : "");
const idFromUrl = (url = "", expected) => {
  const m = String(url).match(/^\/api\/files\/([^/]+)\/([a-f0-9]{24})$/i);
  if (!m) return null;
  return expected && m[1] !== expected ? null : m[2];
};

async function putToGrid(bkt, file) {
  const g = bucket(bkt);
  if (!g) throw Object.assign(new Error("DB not connected"), { status: 503 });
  return await new Promise((resolve, reject) => {
    const ws = g.openUploadStream(safeName(file.originalname), {
      contentType: file.mimetype || "application/octet-stream",
      metadata: { bucket: bkt },
    });
    ws.on("error", reject);
    ws.on("finish", () => resolve(ws.id));
    ws.end(file.buffer);
  });
}

async function delFromGrid(bkt, id) {
  const g = bucket(bkt);
  if (!g || !id) return;
  try { await g.delete(new mongoose.Types.ObjectId(id)); } catch {}
}

/* ---------------- routes ---------------- */

// List (public)
router.get("/", async (_req, res) => {
  try {
    const items = await Article.find({}).sort({ createdAt: -1 }).lean();
    res.json({ success: true, items });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Create (admin) – image optional
router.post("/", isAdmin, upload.single("image"), async (req, res) => {
  try {
    const { title, content = "", link = "", allowHtml = "false", isFree = "false" } = req.body;
    if (!title) return res.status(400).json({ success: false, error: "Title required" });

    let image = "";
    if (req.file?.buffer?.length) {
      const id = await putToGrid("articles", req.file);
      image = fileUrl("articles", id);
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

// Update (admin) – image optional/replace
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

    if (req.file?.buffer?.length) {
      const oldId = idFromUrl(prev.image, "articles");
      if (oldId) await delFromGrid("articles", oldId);
      const newId = await putToGrid("articles", req.file);
      patch.image = fileUrl("articles", newId);
    }

    const updated = await Article.findByIdAndUpdate(req.params.id, patch, { new: true });
    res.json({ success: true, item: updated });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// Delete (admin)
router.delete("/:id", isAdmin, async (req, res) => {
  try {
    const doc = await Article.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: "Not found" });
    const oldId = idFromUrl(doc.image, "articles");
    if (oldId) await delFromGrid("articles", oldId);
    res.json({ success: true, removed: doc });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
