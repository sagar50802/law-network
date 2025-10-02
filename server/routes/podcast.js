import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

import Playlist from "../models/Playlist.js";   // create this model as shown below
import Audio from "../models/Audio.js";         // your existing Audio model

const router = express.Router();

// __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ensure uploads/podcasts exists
const UP_DIR = path.join(__dirname, "..", "uploads", "podcasts");
if (!fs.existsSync(UP_DIR)) fs.mkdirSync(UP_DIR, { recursive: true });

// Multer disk storage for local (Render ephemeral, but works)
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UP_DIR),
  filename: (req, file, cb) => {
    const unique = Date.now() + "_" + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

/* ---------------- PLAYLISTS ---------------- */

// Create playlist
router.post("/playlists", async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) return res.status(400).json({ success: false, message: "Name required" });
    const pl = await Playlist.create({ name });
    res.json({ success: true, playlist: pl });
  } catch (err) {
    console.error("create playlist error", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// List playlists with items
router.get("/", async (_req, res) => {
  try {
    const playlists = await Playlist.find().sort({ createdAt: -1 }).lean();
    for (const p of playlists) {
      p.items = await Audio.find({ playlistName: p.name }).sort({ createdAt: -1 }).lean();
    }
    res.json({ playlists });
  } catch (err) {
    console.error("list playlists error", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Delete playlist
router.delete("/playlists/:id", async (req, res) => {
  try {
    const pl = await Playlist.findById(req.params.id);
    if (!pl) return res.status(404).json({ success: false, message: "Playlist not found" });
    await Audio.deleteMany({ playlistName: pl.name });
    await pl.deleteOne();
    res.json({ success: true });
  } catch (err) {
    console.error("delete playlist error", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/* ---------------- ITEMS (AUDIO) ---------------- */

// Upload item to playlist
router.post("/playlists/:id/items", upload.single("audio"), async (req, res) => {
  try {
    const pl = await Playlist.findById(req.params.id);
    if (!pl) return res.status(404).json({ success: false, message: "Playlist not found" });

    const { title, artist, locked, url } = req.body;
    let audioPath = "";
    if (req.file) {
      audioPath = "/uploads/podcasts/" + req.file.filename;
    } else if (url) {
      audioPath = url;
    } else {
      return res.status(400).json({ success: false, message: "No file or URL provided" });
    }

    const audio = await Audio.create({
      title: title || "Untitled",
      playlistName: pl.name,
      audioPath,
      artist: artist || "",
      locked: locked === "true",
    });

    res.json({ success: true, audio });
  } catch (err) {
    console.error("upload item error", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

// Delete individual item
router.delete("/playlists/:id/items/:iid", async (req, res) => {
  try {
    await Audio.findByIdAndDelete(req.params.iid);
    res.json({ success: true });
  } catch (err) {
    console.error("delete item error", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
