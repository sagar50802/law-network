// server/routes/podcast.js
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

// Build a correct public base that includes the bucket (works for R2 public buckets)
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
    console.log("[/api/podcasts] GET ->", playlists.length, "playlists");
    res.json({ success: true, playlists });
  } catch (err) {
    console.error("Podcast list error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch playlists" });
  }
});

// Admin: create new playlist
router.post("/playlists", isAdmin, express.json(), async (req, res) => {
  try {
    console.log("[/api/podcasts/playlists] POST body:", req.body);
    const { name } = req.body || {};
    if (!name) return res.status(400).json({ success: false, message: "Name required" });

    const playlist = await PodcastPlaylist.create({ name, items: [] });
    console.log(" created playlist:", playlist?._id, playlist?.name);
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
    console.log("[/api/podcasts/:pid/items] POST pid:", pid, "fields:", {
      title, artist, locked, externalUrl: !!externalUrl, hasUpload: !!pickUploaded(req)
    });

    const playlist = await PodcastPlaylist.findById(pid);
    if (!playlist) {
      console.warn(" 404 playlist not found for", pid);
      return res.status(404).json({ success: false, message: "Playlist not found" });
    }

    let finalUrl = "";
    const up = pickUploaded(req);

    if (up) {
      const ext = (up.originalname || "").split(".").pop() || "mp3";
      const key = `podcasts/${Date.now()}-${nanoid()}.${ext}`;
      await s3.send(new PutObjectCommand({
        Bucket: process.env.R2_BUCKET,
        Key: key,
        Body: up.buffer,
        ContentType: up.mimetype || "audio/mpeg",
      }));
      finalUrl = r2PublicUrl(key);
      console.log("  uploaded to R2:", finalUrl);
    } else if (externalUrl && /^https?:\/\//i.test(externalUrl)) {
      finalUrl = externalUrl.trim();
      console.log("  using external URL:", finalUrl);
    } else {
      console.warn(" 400: no audio or url");
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
    console.log("  appended item:", newItem.id, "title:", newItem.title);

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
    console.log("[/api/podcasts/:pid/items/:iid] DELETE", pid, iid);
    const playlist = await PodcastPlaylist.findById(pid);
    if (!playlist) return res.status(404).json({ success: false, message: "Playlist not found" });
    const before = playlist.items?.length || 0;
    playlist.items = (playlist.items || []).filter((x) => x.id !== iid);
    await playlist.save();
    console.log("  items:", before, "=>", playlist.items.length);
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
    console.log("[/api/podcasts/:pid/items/:iid/lock] PATCH", pid, iid, "->", locked);
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

// ✅ Admin: delete playlist (so Admin can remove a whole playlist)
router.delete("/playlists/:pid", isAdmin, async (req, res) => {
  try {
    const { pid } = req.params;
    console.log("[/api/podcasts/playlists/:pid] DELETE", pid);
    const pl = await PodcastPlaylist.findById(pid);
    if (!pl) return res.status(404).json({ success: false, message: "Playlist not found" });
    await PodcastPlaylist.findByIdAndDelete(pid);
    res.json({ success: true });
  } catch (err) {
    console.error("Podcast delete playlist error:", err);
    res.status(500).json({ success: false, message: "Failed to delete playlist" });
  }
});

export default router;
