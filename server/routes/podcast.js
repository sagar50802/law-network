// server/routes/podcast.js
import express from "express";
import multer from "multer";
import mongoose from "mongoose";
import { nanoid } from "nanoid";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { isAdmin } from "./utils.js";

const router = express.Router();

/* ---------- Mongo Model ---------- */
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
const PodcastPlaylist =
  mongoose.models.PodcastPlaylist ||
  mongoose.model("PodcastPlaylist", PodcastPlaylistSchema);

/* ---------- Cloudflare R2 Client ---------- */
const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

/* ---------- Multer (memory) ---------- */
const upload = multer({ storage: multer.memoryStorage() });

/* ---------- Routes ---------- */

// PUBLIC: get all playlists
router.get("/", async (_req, res) => {
  try {
    const playlists = await PodcastPlaylist.find().lean();
    res.json({ success: true, playlists });
  } catch (err) {
    console.error("Podcast list error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch playlists" });
  }
});

// ADMIN: create playlist
router.post("/playlists", isAdmin, async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ success: false, message: "Name required" });
    const playlist = await PodcastPlaylist.create({ name, items: [] });
    res.json({ success: true, playlist });
  } catch (err) {
    console.error("Podcast create error:", err);
    res.status(500).json({ success: false, message: "Failed to create playlist" });
  }
});

// ADMIN: upload audio file into playlist
router.post(
  "/playlists/:pid/items",
  isAdmin,
  upload.single("audio"), // field name "audio"
  async (req, res) => {
    try {
      const { pid } = req.params;
      const { title, artist, locked } = req.body;

      if (!req.file)
        return res.status(400).json({ success: false, message: "No audio file uploaded" });

      const ext = req.file.originalname.split(".").pop();
      const key = `podcasts/${Date.now()}-${nanoid()}.${ext}`;

      await s3.send(
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET, // your bucket name env var
          Key: key,
          Body: req.file.buffer,
          ContentType: req.file.mimetype,
        })
      );

      const publicUrl = `${process.env.R2_PUBLIC_BASE}/${key}`;

      const playlist = await PodcastPlaylist.findById(pid);
      if (!playlist)
        return res.status(404).json({ success: false, message: "Playlist not found" });

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
      res.status(500).json({ success: false, message: err.message || "Upload failed" });
    }
  }
);

// ADMIN: delete item
router.delete("/playlists/:pid/items/:iid", isAdmin, async (req, res) => {
  try {
    const { pid, iid } = req.params;
    const playlist = await PodcastPlaylist.findById(pid);
    if (!playlist) return res.status(404).json({ success: false, message: "Playlist not found" });
    playlist.items = playlist.items.filter((x) => x.id !== iid);
    await playlist.save();
    res.json({ success: true });
  } catch (err) {
    console.error("Podcast delete item error:", err);
    res.status(500).json({ success: false, message: "Failed to delete item" });
  }
});

// ADMIN: toggle lock
router.patch("/playlists/:pid/items/:iid/lock", isAdmin, async (req, res) => {
  try {
    const { pid, iid } = req.params;
    const { locked } = req.body;
    const playlist = await PodcastPlaylist.findById(pid);
    if (!playlist) return res.status(404).json({ success: false, message: "Playlist not found" });
    const item = playlist.items.find((x) => x.id === iid);
    if (!item) return res.status(404).json({ success: false, message: "Item not found" });
    item.locked = !!locked;
    await playlist.save();
    res.json({ success: true, item });
  } catch (err) {
    console.error("Podcast toggle lock error:", err);
    res.status(500).json({ success: false, message: "Failed to toggle lock" });
  }
});

/* ---------- Error Handler ---------- */
router.use((err, _req, res, _next) => {
  console.error("Podcasts route error:", err);
  res.status(err.status || 500).json({ success: false, message: err.message || "Server error" });
});

export default router;
