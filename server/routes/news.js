// server/routes/news.js  (ESM, manual GridFS like articles/consultancy)
import express from "express";
import multer from "multer";
import mongoose from "mongoose";
import { isAdmin } from "./utils.js";
import * as NewsModel from "../models/NewsItem.js";

const NewsItem = NewsModel.default || NewsModel;
const router = express.Router();

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 25 * 1024 * 1024 } });

const bucket = (name) => {
  const db = mongoose.connection?.db;
  return db ? new mongoose.mongo.GridFSBucket(db, { bucketName: name }) : null;
};
const safeName = (orig = "file") => String(orig).replace(/\s+/g, "_").replace(/[^\w.\-]/g, "");
const fileUrl  = (bkt, id) => (id ? `/api/files/${bkt}/${String(id)}` : "");
const idFromUrl = (url = "", expected) => {
  const m = String(url).match(/\/api\/files\/([^/]+)\/([a-f0-9]{24})/i);
  if (!m) return null; if (expected && m[1] !== expected) return null; return m[2];
};
async function putToGrid(bkt, file) {
  const g = bucket(bkt);
  if (!g) throw Object.assign(new Error("DB not connected"), { status: 503 });
  return await new Promise((res, rej) => {
    const ws = g.openUploadStream(safeName(file.originalname), {
      contentType: file.mimetype || "application/octet-stream",
      metadata: { bucket: bkt },
    });
    ws.on("error", rej); ws.on("finish", () => res(ws.id)); ws.end(file.buffer);
  });
}
async function delFromGrid(bkt, id) {
  const g = bucket(bkt); if (!g || !id) return;
  try { await g.delete(new mongoose.Types.ObjectId(id)); } catch {}
}

/* --------- routes --------- */

// list (public)
router.get("/", async (_req, res) => {
  try {
    const items = await NewsItem.find({}).sort({ createdAt: -1 }).lean();
    res.json({ success: true, items });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// create (admin)
router.post("/", isAdmin, upload.single("image"), async (req, res) => {
  try {
    const { title, link = "" } = req.body;
    if (!title) return res.status(400).json({ success: false, error: "Title required" });

    let image = "";
    if (req.file?.buffer?.length) {
      const id = await putToGrid("news", req.file);
      image = fileUrl("news", id);
    }

    const item = await NewsItem.create({ title, link, image });
    res.json({ success: true, item });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// update (admin)
router.patch("/:id", isAdmin, upload.single("image"), async (req, res) => {
  try {
    const prev = await NewsItem.findById(req.params.id);
    if (!prev) return res.status(404).json({ success: false, error: "Not found" });

    const patch = {
      ...(req.body.title != null ? { title: req.body.title } : {}),
      ...(req.body.link  != null ? { link: req.body.link }   : {}),
    };

    if (req.file?.buffer?.length) {
      const oldId = idFromUrl(prev.image, "news");
      if (oldId) await delFromGrid("news", oldId);
      const newId = await putToGrid("news", req.file);
      patch.image = fileUrl("news", newId);
    }

    const item = await NewsItem.findByIdAndUpdate(req.params.id, patch, { new: true });
    res.json({ success: true, item });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// delete (admin)
router.delete("/:id", isAdmin, async (req, res) => {
  try {
    const doc = await NewsItem.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: "Not found" });
    const fid = idFromUrl(doc.image, "news");
    if (fid) await delFromGrid("news", fid);
    res.json({ success: true, removed: doc });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
