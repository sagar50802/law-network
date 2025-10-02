// server/routes/podcasts.js
import express from "express";
import multer from "multer";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { nanoid } from "nanoid";
import Podcast from "../models/Podcast.js"; // your Mongo model
import { isAdmin } from "./utils.js";

const router = express.Router();

// ---------- Cloudflare R2 S3 client ----------
const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT, // e.g. https://<account>.r2.cloudflarestorage.com
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
const BUCKET = process.env.R2_BUCKET;
const PUBLIC_BASE = process.env.R2_PUBLIC_BASE; // e.g. https://pub-xxxx.r2.dev/lawprepx

// ---------- Multer for in-memory file ----------
const storage = multer.memoryStorage();
const upload = multer({ storage });

// ---------- Get all playlists ----------
router.get("/", async (req, res) => {
  const playlists = await Podcast.find().lean();
  res.json({ playlists });
});

// ---------- Create new playlist ----------
router.post("/playlists", isAdmin, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "name required" });

  const playlist = new Podcast({ name, items: [] });
  await playlist.save();
  res.json(playlist);
});

// ---------- Add item to playlist ----------
router.post(
  "/playlists/:pid/items",
  isAdmin,
  upload.single("audio"),
  async (req, res) => {
    try {
      const playlist = await Podcast.findById(req.params.pid);
      if (!playlist) return res.status(404).json({ error: "playlist not found" });

      let url = req.body.externalUrl || null;
      if (req.file) {
        // Upload to R2
        const ext = req.file.originalname.split(".").pop();
        const key = `podcasts/${Date.now()}_${nanoid()}.${ext}`;
        await s3.send(
          new PutObjectCommand({
            Bucket: BUCKET,
            Key: key,
            Body: req.file.buffer,
            ContentType: req.file.mimetype,
          })
        );
        url = `${PUBLIC_BASE}/${key}`;
      }

      const item = {
        id: nanoid(),
        title: req.body.title || "Untitled",
        artist: req.body.artist || "",
        url,
        locked: req.body.locked !== "false",
      };

      playlist.items.push(item);
      await playlist.save();
      res.json(item);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: err.message });
    }
  }
);

// ---------- Delete item from playlist ----------
router.delete(
  "/playlists/:pid/items/:iid",
  isAdmin,
  async (req, res) => {
    const playlist = await Podcast.findById(req.params.pid);
    if (!playlist) return res.status(404).json({ error: "playlist not found" });

    const idx = playlist.items.findIndex((x) => x.id === req.params.iid);
    if (idx === -1) return res.status(404).json({ error: "item not found" });

    // optional: also delete from R2 if it’s an R2 URL
    const url = playlist.items[idx].url;
    if (url && url.includes(PUBLIC_BASE)) {
      const key = url.replace(`${PUBLIC_BASE}/`, "");
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
      } catch (err) {
        console.warn("delete from R2 failed", err.message);
      }
    }

    playlist.items.splice(idx, 1);
    await playlist.save();
    res.json({ ok: true });
  }
);

// ---------- Toggle lock ----------
router.patch(
  "/playlists/:pid/items/:iid/lock",
  isAdmin,
  async (req, res) => {
    const playlist = await Podcast.findById(req.params.pid);
    if (!playlist) return res.status(404).json({ error: "playlist not found" });

    const item = playlist.items.find((x) => x.id === req.params.iid);
    if (!item) return res.status(404).json({ error: "item not found" });

    item.locked = !!req.body.locked;
    await playlist.save();
    res.json(item);
  }
);

export default router;
