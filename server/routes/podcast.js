import express from "express";
import multer from "multer";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { nanoid } from "nanoid";
import mongoose from "mongoose";
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

/* ---------- R2 / S3 Client ---------- */
const s3 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

// Build a correct public base that includes the bucket
function r2PublicUrl(key) {
  const base = String(process.env.R2_PUBLIC_BASE || "").replace(/\/+$/, "");
  const bucket = String(process.env.R2_BUCKET || "").replace(/^\/+|\/+$/g, "");
  return `${base}/${bucket}/${key}`;
}

/* ---------- Multer (memory) ---------- */
const upload = multer({ storage: multer.memoryStorage() });
const uploadAny = upload.fields([
  { name: "audio", maxCount: 1 },
  { name: "file", maxCount: 1 },
  { name: "upload", maxCount: 1 },
]);
function pickUploaded(req) {
  return (
    req.file ||
    req.files?.audio?.[0] ||
    req.files?.file?.[0] ||
    req.files?.upload?.[0] ||
    null
  );
}

/* ---------- Routes ---------- */

// Public: get all playlists
router.get("/", async (_req, res) => {
  try {
    const playlists = await PodcastPlaylist.find().lean();
    res.json({ success: true, playlists });
  } catch (err) {
    console.error("Podcast list error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch playlists" });
  }
});

// Admin: create new playlist
router.post("/playlists", isAdmin, express.json(), async (req, res) => {
  try {
    const { name } = req.body || {};
    if (!name) return res.status(400).json({ success: false, message: "Name required" });

    const playlist = await PodcastPlaylist.create({ name, items: [] });
    res.json({ success: true, playlist });
  } catch (err) {
    console.error("Podcast create error:", err);
    res.status(500).json({ success: false, message: "Failed to create playlist" });
  }
});

// Admin: upload audio OR attach external URL into playlist
router.post("/playlists/:pid/items", isAdmin, uploadAny, async (req, res) => {
  try {
    const { pid } = req.params;
    const { title, artist, locked, url: externalUrl } = req.body || {};

    const playlist = await PodcastPlaylist.findById(pid);
    if (!playlist) {
      return res.status(404).json({ success: false, message: "Playlist not found" });
    }

    let finalUrl = "";
    const up = pickUploaded(req);

    if (up) {
      const ext = (up.originalname || "").split(".").pop() || "mp3";
      const key = `podcasts/${Date.now()}-${nanoid()}.${ext}`;

      await s3.send(
        new PutObjectCommand({
          Bucket: process.env.R2_BUCKET,
          Key: key,
          Body: up.buffer,
          ContentType: up.mimetype || "audio/mpeg",
        })
      );

      finalUrl = r2PublicUrl(key);
    } else if (externalUrl && /^https?:\/\//i.test(externalUrl)) {
      finalUrl = externalUrl.trim();
    } else {
      return res.status(400).json({ success: false, message: "No audio file or URL" });
    }

    const newItem = {
      id: nanoid(),
      title: title || "Untitled",
      artist: artist || "",
      url: finalUrl,
      locked: String(locked) === "true" || locked === true,
    };

    playlist.items.push(newItem);
    await playlist.save();

    res.json({ success: true, item: newItem });
  } catch (err) {
    console.error("Podcast upload error:", err);
    res.status(500).json({ success: false, message: err.message || "Upload failed" });
  }
});

// Admin: delete item
router.delete("/playlists/:pid/items/:iid", isAdmin, async (req, res) => {
  try {
    const { pid, iid } = req.params;
    const playlist = await PodcastPlaylist.findById(pid);
    if (!playlist) return res.status(404).json({ success: false, message: "Playlist not found" });
    playlist.items = (playlist.items || []).filter((x) => x.id !== iid);
    await playlist.save();
    res.json({ success: true });
  } catch (err) {
    console.error("Podcast delete item error:", err);
    res.status(500).json({ success: false, message: "Failed to delete item" });
  }
});

// Admin: toggle lock
router.patch("/playlists/:pid/items/:iid/lock", isAdmin, express.json(), async (req, res) => {
  try {
    const { pid, iid } = req.params;
    const { locked } = req.body || {};
    const playlist = await PodcastPlaylist.findById(pid);
    if (!playlist) return res.status(404).json({ success: false, message: "Playlist not found" });
    const item = (playlist.items || []).find((x) => x.id === iid);
    if (!item) return res.status(404).json({ success: false, message: "Item not found" });
    item.locked = !!locked;
    await playlist.save();
    res.json({ success: true, item });
  } catch (err) {
    console.error("Podcast toggle lock error:", err);
    res.status(500).json({ success: false, message: "Failed to toggle lock" });
  }
});

export default router;
