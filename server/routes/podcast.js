import express from "express";
import multer from "multer";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { nanoid } from "nanoid";
import mongoose from "mongoose";
import { isAdmin } from "./utils.js";

const router = express.Router();

/* ---------- Mongo model ---------- */
const PodcastPlaylistSchema = new mongoose.Schema({
  name: String,
  items: [
    {
      id: String,
      title: String,
      artist: String,
      url: String,
      locked: { type: Boolean, default: true },
      key: String, // the R2 key for deletion
      createdAt: { type: Date, default: Date.now },
    },
  ],
});
const PodcastPlaylist =
  mongoose.models.PodcastPlaylist ||
  mongoose.model("PodcastPlaylist", PodcastPlaylistSchema);

/* ---------- Cloudflare R2 client ---------- */
const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
const BUCKET = process.env.R2_BUCKET || "law-network";

/* ---------- Multer in-memory ---------- */
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 800 * 1024 * 1024 },
});

/* ---------- Routes ---------- */

// Public GET all playlists
router.get("/", async (_req, res) => {
  const playlists = await PodcastPlaylist.find().lean();
  res.json({ success: true, playlists });
});

// Admin create playlist
router.post("/playlists", isAdmin, async (req, res) => {
  const { name } = req.body;
  if (!name)
    return res.status(400).json({ success: false, message: "Name required" });
  const playlist = await PodcastPlaylist.create({ name, items: [] });
  res.json({ success: true, playlist });
});

// Admin upload audio into playlist
router.post(
  "/playlists/:pid/items",
  isAdmin,
  upload.single("audio"),
  async (req, res) => {
    try {
      const { pid } = req.params;
      const { title, artist, locked } = req.body;

      // either file or URL
      let publicUrl = req.body.url?.trim();
      let key = null;

      if (req.file) {
        const ext = req.file.originalname.split(".").pop();
        key = `podcasts/${Date.now()}-${nanoid()}.${ext}`;

        await s3.send(
          new PutObjectCommand({
            Bucket: BUCKET,
            Key: key,
            Body: req.file.buffer,
            ContentType: req.file.mimetype,
          })
        );

        publicUrl = `${process.env.R2_PUBLIC_BASE}/${key}`;
      }

      if (!publicUrl)
        return res.status(400).json({ success: false, message: "No audio provided" });

      const playlist = await PodcastPlaylist.findById(pid);
      if (!playlist)
        return res
          .status(404)
          .json({ success: false, message: "Playlist not found" });

      const newItem = {
        id: nanoid(),
        title: title || "Untitled",
        artist: artist || "",
        url: publicUrl,
        locked: String(locked) === "true",
        key,
      };

      playlist.items.push(newItem);
      await playlist.save();

      res.json({ success: true, item: newItem });
    } catch (err) {
      console.error("Podcast upload error:", err);
      res
        .status(500)
        .json({ success: false, message: err.message || "Upload failed" });
    }
  }
);

// Admin delete item
router.delete("/playlists/:pid/items/:iid", isAdmin, async (req, res) => {
  const { pid, iid } = req.params;
  const playlist = await PodcastPlaylist.findById(pid);
  if (!playlist)
    return res
      .status(404)
      .json({ success: false, message: "Playlist not found" });

  const idx = playlist.items.findIndex((x) => x.id === iid);
  if (idx < 0)
    return res.status(404).json({ success: false, message: "Item not found" });

  const removed = playlist.items.splice(idx, 1)[0];
  await playlist.save();

  // delete from R2
  if (removed?.key) {
    try {
      await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: removed.key }));
    } catch (e) {
      console.error("R2 delete error:", e.message);
    }
  }

  res.json({ success: true });
});

// Admin toggle lock
router.patch("/playlists/:pid/items/:iid/lock", isAdmin, async (req, res) => {
  const { pid, iid } = req.params;
  const { locked } = req.body;
  const playlist = await PodcastPlaylist.findById(pid);
  if (!playlist)
    return res
      .status(404)
      .json({ success: false, message: "Playlist not found" });
  const item = playlist.items.find((x) => x.id === iid);
  if (!item)
    return res.status(404).json({ success: false, message: "Item not found" });
  item.locked = !!locked;
  await playlist.save();
  res.json({ success: true, item });
});

// Admin delete playlist
router.delete("/playlists/:pid", isAdmin, async (req, res) => {
  const playlist = await PodcastPlaylist.findById(req.params.pid);
  if (!playlist)
    return res
      .status(404)
      .json({ success: false, message: "Playlist not found" });

  for (const it of playlist.items) {
    if (it.key) {
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: it.key }));
      } catch {}
    }
  }

  await PodcastPlaylist.findByIdAndDelete(req.params.pid);
  res.json({ success: true });
});

export default router;
