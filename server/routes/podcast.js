// server/routes/podcast.js
import express from "express";
import multer from "multer";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import Playlist from "../models/Playlist.js";

const router = express.Router();

// ---------- Cloudflare R2 config ----------
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const bucketName = process.env.R2_BUCKET || "lawprepx";
const publicBase = process.env.R2_PUBLIC_BASE; // e.g. pub-xxxxxx.r2.dev

// ---------- Multer memory storage ----------
const upload = multer({ storage: multer.memoryStorage() });

// ---------- Routes ----------

// 1. List all playlists with items
router.get("/", async (req, res) => {
  try {
    const playlists = await Playlist.find();
    res.json({ playlists });
  } catch (err) {
    console.error("GET playlists failed:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// 2. Create a new playlist
router.post("/playlists", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: "Playlist name required" });
    }
    const playlist = await Playlist.create({ name: name.trim(), items: [] });
    res.json(playlist);
  } catch (err) {
    console.error("Create playlist failed:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// 3. Delete a playlist
router.delete("/playlists/:id", async (req, res) => {
  try {
    await Playlist.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error("Delete playlist failed:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// 4. Upload an audio item into a playlist
router.post("/playlists/:id/items", upload.single("audio"), async (req, res) => {
  try {
    const playlistId = req.params.id;
    const { title, artist, locked, url } = req.body;

    let audioUrl = url?.trim();
    if (!audioUrl && req.file) {
      const ext = req.file.originalname.split(".").pop();
      const key = `podcasts/${Date.now()}_${Math.random()
        .toString(36)
        .slice(2)}.${ext}`;

      await s3.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: key,
          Body: req.file.buffer,
          ContentType: req.file.mimetype,
        })
      );

      if (!publicBase) {
        return res
          .status(500)
          .json({ error: "Missing R2_PUBLIC_BASE in environment" });
      }

      audioUrl = `https://${publicBase}/${key}`;
    }

    if (!audioUrl) {
      return res.status(400).json({ error: "No audio URL or file" });
    }

    const playlist = await Playlist.findById(playlistId);
    if (!playlist) {
      return res.status(404).json({ error: "Playlist not found" });
    }

    playlist.items.push({
      title: title || "Untitled",
      artist: artist || "",
      url: audioUrl,
      locked: locked === "true",
    });
    await playlist.save();

    res.json({ ok: true, playlist });
  } catch (err) {
    console.error("Upload item failed:", err);
    res.status(500).json({ error: "Server error" });
  }
});

// 5. Delete an audio item from a playlist
router.delete("/playlists/:pid/items/:iid", async (req, res) => {
  try {
    const playlist = await Playlist.findById(req.params.pid);
    if (!playlist) {
      return res.status(404).json({ error: "Playlist not found" });
    }

    const idx = playlist.items.findIndex(
      (it) => String(it._id) === req.params.iid
    );
    if (idx === -1) {
      return res.status(404).json({ error: "Item not found" });
    }

    // Optionally delete from R2 if URL is in bucket
    // const key = playlist.items[idx].url.split(".r2.dev/")[1];
    // if (key) await s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: key }));

    playlist.items.splice(idx, 1);
    await playlist.save();

    res.json({ ok: true, playlist });
  } catch (err) {
    console.error("Delete item failed:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
