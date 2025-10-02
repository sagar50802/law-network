// server/routes/podcast.js
import express from "express";
import multer from "multer";
import { nanoid } from "nanoid";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

import Audio from "../models/Audio.js";
import Playlist from "../models/Playlist.js"; // you already have this

const router = express.Router();

// --- Cloudflare R2 client ---
const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

// --- memory upload ---
const upload = multer({ storage: multer.memoryStorage() });

// ------------------------------------------------------------
// GET all playlists + items
router.get("/", async (req, res) => {
  try {
    const pls = await Playlist.find({ type: "podcast" }).lean();
    // attach audio items for each playlist
    for (const pl of pls) {
      pl.items = await Audio.find({ playlistName: pl.name }).lean();
    }
    res.json({ playlists: pls });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------------------------------------------
// POST create new playlist
router.post("/playlists", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ success: false, message: "Missing name" });
    const pl = await Playlist.create({ name, type: "podcast" });
    res.json(pl);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------------------------------------------
// POST upload new audio into playlist
router.post("/playlists/:pid/items", upload.single("audio"), async (req, res) => {
  try {
    const pid = req.params.pid;
    const playlist = await Playlist.findById(pid);
    if (!playlist) return res.status(404).json({ success: false, message: "Playlist not found" });

    // Upload file to Cloudflare R2
    const file = req.file;
    if (!file) return res.status(400).json({ success: false, message: "Missing file" });

    const key = `podcasts/${nanoid()}_${file.originalname}`;
    await s3.send(
      new PutObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: key,
        Body: file.buffer,
        ContentType: file.mimetype,
      })
    );

    // Build public URL
    const publicUrl = `${process.env.R2_PUBLIC_BASE}/${key}`;

    const doc = await Audio.create({
      title: req.body.title || file.originalname,
      playlistName: playlist.name,
      audioPath: publicUrl,
    });

    res.json(doc);
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// ------------------------------------------------------------
// DELETE an audio item
router.delete("/playlists/:pid/items/:iid", async (req, res) => {
  try {
    await Audio.findByIdAndDelete(req.params.iid);
    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
