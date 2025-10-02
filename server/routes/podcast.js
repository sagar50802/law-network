// server/routes/podcast.js
import express from "express";
import multer from "multer";
import crypto from "crypto";
import {
  S3Client,
  PutObjectCommand
} from "@aws-sdk/client-s3";

const router = express.Router();

// R2 client
const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const R2_BUCKET = process.env.R2_BUCKET;
const PUBLIC_BASE = process.env.R2_PUBLIC_BASE;

// In-memory store for playlists
let playlists = []; // { _id, name, items:[] }
const newId = () => crypto.randomBytes(4).toString("hex");

// Multer
const upload = multer({ storage: multer.memoryStorage() });

// GET all playlists
router.get("/", (req, res) => {
  res.json({ playlists });
});

// Create new playlist
router.post("/playlists", express.json(), (req, res) => {
  const name = (req.body?.name || "").trim() || "Untitled";
  const _id = newId();
  const pl = { _id, name, items: [] };
  playlists.push(pl);
  return res.json(pl);  // <— send back the playlist with name!
});

// Delete playlist
router.delete("/playlists/:pid", (req, res) => {
  playlists = playlists.filter((p) => String(p._id) !== String(req.params.pid));
  return res.json({ success: true });
});

// Upload audio or URL
router.post("/playlists/:pid/items", upload.single("audio"), async (req, res) => {
  const pl = playlists.find((p) => String(p._id) === String(req.params.pid));
  if (!pl) return res.status(404).json({ success: false, message: "Playlist not found" });

  const id = newId();
  const title = (req.body?.title || "").trim() || "Untitled";
  const artist = (req.body?.artist || "").trim();
  const locked = String(req.body?.locked) === "true";

  let url = req.body?.url?.trim();
  if (!url && req.file) {
    const ext = req.file.originalname.split(".").pop();
    const key = `podcasts/${Date.now()}_${id}.${ext}`;
    await s3.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    }));
    url = `${PUBLIC_BASE}/${key}`;
  }

  if (!url) return res.status(400).json({ success: false, message: "No file or URL provided" });

  pl.items.push({ id, title, artist, url, locked });
  return res.json({ success: true, id });
});

// Delete item
router.delete("/playlists/:pid/items/:iid", (req, res) => {
  const pl = playlists.find((p) => String(p._id) === String(req.params.pid));
  if (!pl) return res.status(404).json({ success: false, message: "Playlist not found" });
  pl.items = pl.items.filter((x) => String(x.id) !== String(req.params.iid));
  return res.json({ success: true });
});

export default router;
