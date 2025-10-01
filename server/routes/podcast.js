// server/routes/podcasts.js  ✅ patched
import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import mongoose from "mongoose";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { nanoid } from "nanoid";
import { isAdmin } from "./utils.js";   // only isAdmin now

const router = express.Router();

// ✅ ensureDir inline so no broken import
function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    console.error("ensureDir error:", err.message);
  }
}

// --- Models ---
const PodcastPlaylistSchema = new mongoose.Schema({
  name: String,
  items: [
    {
      id: String,
      title: String,
      artist: String,
      url: String,
      locked: { type: Boolean, default: true },
    },
  ],
});
const PodcastPlaylist = mongoose.model("PodcastPlaylist", PodcastPlaylistSchema);

// --- S3 client for R2 ---
const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

// --- Multer ---
const upload = multer({ storage: multer.memoryStorage() });

// --- GET all playlists (public) ---
router.get("/", async (req, res) => {
  const playlists = await PodcastPlaylist.find();
  res.json({ playlists });
});

// --- Create playlist (admin) ---
router.post("/playlists", isAdmin, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Name required" });
    const playlist = await PodcastPlaylist.create({ name, items: [] });
    res.json({ playlist });
  } catch (err) {
    console.error("Podcast create playlist error:", err);
    res.status(500).json({ error: err.message || "Server error" });
  }
});

// --- Upload audio into playlist (admin) ---
router.post(
  "/playlists/:pid/items",
  isAdmin,
  upload.single("audio"),
  async (req, res) => {
    try {
      const { pid } = req.params;
      const { title, artist, locked } = req.body;

      if (!req.file) return res.status(400).json({ error: "No audio file uploaded" });

      const ext = req.file.originalname.split(".").pop();
      const key = `podcasts/${Date.now()}-${nanoid()}.${ext}`;

      await s3.send(
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET || "lawprepx", // your bucket name
          Key: key,
          Body: req.file.buffer,
          ContentType: req.file.mimetype,
        })
      );

      const publicUrl = `${process.env.R2_PUBLIC_BASE}/${key}`;

      const playlist = await PodcastPlaylist.findById(pid);
      if (!playlist) return res.status(404).json({ error: "Playlist not found" });

      const newItem = {
        id: nanoid(),
        title: title || "Untitled",
        artist: artist || "",
        url: publicUrl,
        locked: String(locked) === "true",
      };

      playlist.items.push(newItem);
      await playlist.save();

      res.json({ success: true, item: newItem });
    } catch (err) {
      console.error("Podcast upload error:", err);
      res.status(500).json({ error: err.message || "Upload failed" });
    }
  }
);

// --- Delete item (admin) ---
router.delete("/playlists/:pid/items/:iid", isAdmin, async (req, res) => {
  const { pid, iid } = req.params;
  const playlist = await PodcastPlaylist.findById(pid);
  if (!playlist) return res.status(404).json({ error: "Playlist not found" });
  playlist.items = playlist.items.filter((x) => x.id !== iid);
  await playlist.save();
  res.json({ success: true });
});

// --- Toggle lock (admin) ---
router.patch("/playlists/:pid/items/:iid/lock", isAdmin, async (req, res) => {
  const { pid, iid } = req.params;
  const { locked } = req.body;
  const playlist = await PodcastPlaylist.findById(pid);
  if (!playlist) return res.status(404).json({ error: "Playlist not found" });
  const item = playlist.items.find((x) => x.id === iid);
  if (!item) return res.status(404).json({ error: "Item not found" });
  item.locked = !!locked;
  await playlist.save();
  res.json({ success: true, item });
});

export default router;
