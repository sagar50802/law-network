// server/routes/podcast.js
import express from "express";
import multer from "multer";
import mongoose from "mongoose";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { nanoid } from "nanoid";

const router = express.Router();

/* --------------------- Mongo Schema --------------------- */
const PodcastPlaylistSchema = new mongoose.Schema({
  name: { type: String, required: true },
  items: [
    {
      id: String,
      title: String,
      artist: String,
      url: String, // Cloudflare R2 URL
      locked: { type: Boolean, default: true },
    },
  ],
});

const PodcastPlaylist =
  mongoose.models.PodcastPlaylist ||
  mongoose.model("PodcastPlaylist", PodcastPlaylistSchema);

/* --------------------- R2 / S3 client --------------------- */
const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT, // eg https://xxxx.r2.cloudflarestorage.com
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

// your bucket name from Cloudflare R2 (hardcoded or env)
const BUCKET = process.env.R2_BUCKET || "lawprepx";

/* --------------------- Multer (memory) --------------------- */
const upload = multer({ storage: multer.memoryStorage() });

/* --------------------- Routes --------------------- */

// GET all playlists
router.get("/", async (req, res) => {
  try {
    const playlists = await PodcastPlaylist.find().lean();
    res.json({ playlists });
  } catch (err) {
    console.error("Error fetching playlists:", err);
    res.status(500).json({ error: "Failed to load playlists" });
  }
});

// Create new playlist
router.post("/playlists", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ error: "Missing playlist name" });
    const playlist = await PodcastPlaylist.create({ name, items: [] });
    res.json({ playlist });
  } catch (err) {
    console.error("Error creating playlist:", err);
    res.status(500).json({ error: "Failed to create playlist" });
  }
});

// Upload audio file to R2 and attach metadata
router.post(
  "/playlists/:pid/items",
  upload.single("audio"),
  async (req, res) => {
    try {
      const { pid } = req.params;
      const { title, artist, locked } = req.body;

      if (!req.file)
        return res.status(400).json({ error: "No audio file uploaded" });

      // create unique key in bucket
      const ext = req.file.originalname.split(".").pop();
      const key = `podcasts/${Date.now()}-${nanoid()}.${ext}`;

      // upload to Cloudflare R2
      await s3.send(
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: key,
          Body: req.file.buffer,
          ContentType: req.file.mimetype,
        })
      );

      // build public URL
      const publicUrl = `${process.env.R2_PUBLIC_BASE}/${key}`;

      // save in MongoDB
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

// Delete an audio item from playlist
router.delete("/playlists/:pid/items/:iid", async (req, res) => {
  try {
    const { pid, iid } = req.params;
    const playlist = await PodcastPlaylist.findById(pid);
    if (!playlist) return res.status(404).json({ error: "Playlist not found" });
    playlist.items = playlist.items.filter((x) => x.id !== iid);
    await playlist.save();
    res.json({ success: true });
  } catch (err) {
    console.error("Delete error:", err);
    res.status(500).json({ error: "Delete failed" });
  }
});

// Toggle lock/unlock an item
router.patch("/playlists/:pid/items/:iid/lock", async (req, res) => {
  try {
    const { pid, iid } = req.params;
    const { locked } = req.body;
    const playlist = await PodcastPlaylist.findById(pid);
    if (!playlist) return res.status(404).json({ error: "Playlist not found" });
    const item = playlist.items.find((x) => x.id === iid);
    if (!item) return res.status(404).json({ error: "Item not found" });
    item.locked = !!locked;
    await playlist.save();
    res.json({ success: true, item });
  } catch (err) {
    console.error("Lock toggle error:", err);
    res.status(500).json({ error: "Update failed" });
  }
});

export default router;
