// server/routes/podcast.js
import express from "express";
import multer from "multer";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { ensureDir } from "./utils.js";
import Audio from "../models/Audio.js"; // your Audio.js model
import Playlist from "../models/Playlist.js"; // if you have one

const router = express.Router();

/** ---------- Multer setup (in-memory) ---------- */
const storage = multer.memoryStorage();
const upload = multer({ storage });

/** ---------- S3 Client for Cloudflare R2 ---------- */
const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
const BUCKET = process.env.R2_BUCKET;

/** ---------- GET all playlists with items ---------- */
router.get("/", async (req, res) => {
  try {
    // fetch all audio docs and group by playlist
    const items = await Audio.find().lean();
    const grouped = items.reduce((acc, item) => {
      if (!acc[item.playlistName]) acc[item.playlistName] = [];
      acc[item.playlistName].push(item);
      return acc;
    }, {});
    const playlists = Object.entries(grouped).map(([name, audios]) => ({
      name,
      audios,
    }));
    res.json({ playlists });
  } catch (err) {
    console.error("GET /podcasts error", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/** ---------- POST upload audio to playlist ---------- */
router.post("/upload", upload.single("audio"), async (req, res) => {
  try {
    const { playlistName, title, speaker } = req.body;
    if (!playlistName || !title || !req.file)
      return res
        .status(400)
        .json({ success: false, message: "Missing fields" });

    // key name in bucket
    const key = `podcasts/${Date.now()}_${req.file.originalname}`;

    // upload to R2
    await s3.send(
      new PutObjectCommand({
        Bucket: BUCKET,
        Key: key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      })
    );

    // public URL
    const url = `${process.env.R2_PUBLIC_BASE}/${key}`;

    // store in Mongo
    const audio = await Audio.create({
      title,
      playlistName,
      audioPath: url,
    });

    res.json({ success: true, audio });
  } catch (err) {
    console.error("POST /podcasts/upload error", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/** ---------- DELETE audio ---------- */
router.delete("/:id", async (req, res) => {
  try {
    const audio = await Audio.findById(req.params.id);
    if (!audio) return res.status(404).json({ success: false, message: "Not found" });

    // extract key from URL (R2_PUBLIC_BASE/key)
    const publicBase = process.env.R2_PUBLIC_BASE + "/";
    const key = audio.audioPath.replace(publicBase, "");

    // delete from R2
    await s3.send(
      new DeleteObjectCommand({
        Bucket: BUCKET,
        Key: key,
      })
    );

    await audio.deleteOne();
    res.json({ success: true });
  } catch (err) {
    console.error("DELETE /podcasts/:id error", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
