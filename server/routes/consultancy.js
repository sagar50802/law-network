// server/routes/consultancy.js  (ESM, manual GridFS)
import express from "express";
import multer from "multer";
import mongoose from "mongoose";
import { isAdmin } from "./utils.js";
import * as ConsultancyModel from "../models/Consultancy.js";

const Consultancy = ConsultancyModel.default || ConsultancyModel;
const router = express.Router();

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

// List (public)
router.get("/", async (_req, res) => {
  try {
    const items = await Consultancy.find({}).sort({ order: 1, createdAt: -1 }).lean();
    res.json({ success: true, items });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

// Create (admin) – image required
router.post("/", isAdmin, upload.single("image"), async (req, res) => {
  try {
    const { title, subtitle = "", intro = "", order = 0 } = req.body;
    if (!title) return res.status(400).json({ success: false, error: "Title required" });
    if (!req.file?.buffer?.length) return res.status(400).json({ success: false, error: "Image required" });

    const id = await putToGrid("consultancy", req.file);
    const item = await Consultancy.create({
      title,
      subtitle,
      intro,
      order: Number(order || 0),
      image: fileUrl("consultancy", id),
    });

    res.json({ success: true, item });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// Update (admin) – image optional/replace
router.patch("/:id", isAdmin, upload.single("image"), async (req, res) => {
  try {
    const prev = await Consultancy.findById(req.params.id);
    if (!prev) return res.status(404).json({ success: false, error: "Not found" });

    const patch = {
      ...(req.body.title != null ? { title: req.body.title } : {}),
      ...(req.body.subtitle != null ? { subtitle: req.body.subtitle } : {}),
      ...(req.body.intro != null ? { intro: req.body.intro } : {}),
      ...(req.body.order != null ? { order: Number(req.body.order) } : {}),
    };

    if (req.file?.buffer?.length) {
      const oldId = idFromUrl(prev.image, "consultancy");
      if (oldId) await delFromGrid("consultancy", oldId);
      const newId = await putToGrid("consultancy", req.file);
      patch.image = fileUrl("consultancy", newId);
    }

    const updated = await Consultancy.findByIdAndUpdate(req.params.id, patch, { new: true });
    res.json({ success: true, item: updated });
  } catch (e) {
    res.status(e.status || 500).json({ success: false, error: e.message });
  }
});

// Delete (admin)
router.delete("/:id", isAdmin, async (req, res) => {
  try {
    const doc = await Consultancy.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ success: false, error: "Not found" });
    const fid = idFromUrl(doc.image, "consultancy");
    if (fid) await delFromGrid("consultancy", fid);
    res.json({ success: true, removed: doc });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

export default router;
