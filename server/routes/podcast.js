import express from "express";
import multer from "multer";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import Audio from "../models/Audio.js"; // your mongoose model

const router = express.Router();

// ============= Cloudflare R2 S3 client =============
const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
const BUCKET = process.env.R2_BUCKET;
const PUBLIC_BASE = process.env.R2_PUBLIC_BASE;

// ============= Multer (memory) =============
const storage = multer.memoryStorage();
const upload = multer({ storage });

// ============= Routes =============

// fetch all playlists with their items
router.get("/", async (req, res) => {
  try {
    const audios = await Audio.find().sort({ createdAt: -1 });
    // group by playlistName
    const playlists = {};
    for (const a of audios) {
      if (!playlists[a.playlistName]) playlists[a.playlistName] = [];
      playlists[a.playlistName].push(a);
    }
    res.json({ playlists });
  } catch (err) {
    console.error("GET /podcasts error", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// upload a new audio file to R2 and save metadata
router.post("/", upload.single("audio"), async (req, res) => {
  try {
    const { title, speaker, playlistName } = req.body;
    if (!req.file) throw new Error("No audio file uploaded");

    // create unique key
    const ext = req.file.originalname.split(".").pop();
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

    const publicUrl = `${PUBLIC_BASE}/${key}`;

    // save to Mongo
    const audio = new Audio({
      title,
      playlistName,
      audioPath: publicUrl,
      speaker: speaker || "",
    });
    await audio.save();

    res.json({ success: true, audio });
  } catch (err) {
    console.error("POST /podcasts error", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// delete an audio entry (optional)
router.delete("/:id", async (req, res) => {
  try {
    await Audio.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
