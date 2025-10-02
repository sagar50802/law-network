// server/routes/podcast.js
import express from "express";
import multer from "multer";
import crypto from "crypto";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";

const router = express.Router();

/* ---------- Cloudflare R2 config ---------- */
const R2_BUCKET = process.env.R2_BUCKET; // e.g. law-network
const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT, // e.g. https://<accountid>.r2.cloudflarestorage.com
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

/* ---------- In-memory store (replace with DB later) ---------- */
let playlists = []; // [{ _id, name, items:[{ id,title,artist,url,locked }] }]
const newId = () => crypto.randomBytes(4).toString("hex");
const findPl = (id) => playlists.find((p) => String(p._id) === String(id));

/* ---------- Multer memory storage ---------- */
const upload = multer({ storage: multer.memoryStorage() });

/* ---------- List playlists ---------- */
router.get("/", (_req, res) => res.json({ playlists }));

/* ---------- Create playlist ---------- */
router.post("/playlists", express.json(), (req, res) => {
  const name = (req.body?.name || "").trim() || "Untitled";
  const _id = newId();
  playlists.push({ _id, name, items: [] });
  res.json({ success: true, _id });
});

/* ---------- Delete playlist ---------- */
router.delete("/playlists/:pid", (req, res) => {
  playlists = playlists.filter((p) => String(p._id) !== String(req.params.pid));
  res.json({ success: true });
});

/* ---------- Add item (upload or URL) ---------- */
router.post("/playlists/:pid/items", upload.single("audio"), async (req, res) => {
  const pl = findPl(req.params.pid);
  if (!pl) return res.status(404).json({ success: false, message: "Playlist not found" });

  const id = newId();
  const title = (req.body?.title || "").trim() || "Untitled";
  const artist = (req.body?.artist || "").trim();
  const locked = String(req.body?.locked) === "true";

  let url = req.body?.url?.trim();

  // If file uploaded, push to R2
  if (!url && req.file) {
    const ext = req.file.originalname.split(".").pop();
    const key = `podcasts/${Date.now()}_${id}.${ext}`;
    await s3.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    }));
    // You can make a public base URL:
    url = `${process.env.R2_PUBLIC_BASE}/${key}`;
  }

  if (!url) return res.status(400).json({ success: false, message: "No file or URL provided" });

  pl.items.push({ id, title, artist, url, locked });
  res.json({ success: true, id });
});

/* ---------- Delete item ---------- */
router.delete("/playlists/:pid/items/:iid", (req, res) => {
  const pl = findPl(req.params.pid);
  if (!pl) return res.status(404).json({ success: false, message: "Playlist not found" });
  pl.items = pl.items.filter((it) => String(it.id) !== String(req.params.iid));
  res.json({ success: true });
});

/* ---------- Lock/unlock item ---------- */
router.patch("/playlists/:pid/items/:iid/lock", express.json(), (req, res) => {
  const pl = findPl(req.params.pid);
  if (!pl) return res.status(404).json({ success: false, message: "Playlist not found" });
  const it = pl.items.find((x) => String(x.id) === String(req.params.iid));
  if (!it) return res.status(404).json({ success: false, message: "Item not found" });
  it.locked = !!req.body?.locked;
  res.json({ success: true });
});

export default router;
