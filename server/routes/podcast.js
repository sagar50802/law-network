import express from "express";
import multer from "multer";
import path from "path";
import { ensureDir, isAdmin } from "./utils.js";

const router = express.Router();

/* ---------- Upload folder ---------- */
const UP_DIR = path.join(process.cwd(), "server", "uploads", "podcasts");
ensureDir(UP_DIR);

/* ---------- Multer setup ---------- */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UP_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

/* ---------- In-memory playlists (replace with DB later) ---------- */
let playlists = [];

/* ---------- Routes ---------- */

// GET all playlists with their items
router.get("/", async (req, res) => {
  res.json({ playlists });
});

// Create a new playlist
router.post("/playlists", isAdmin, async (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "Playlist name is required" });

  const playlist = {
    id: Date.now().toString(),
    name,
    items: [],
  };
  playlists.push(playlist);
  res.json(playlist);
});

// Upload audio into a playlist
router.post("/:playlistId", isAdmin, upload.single("file"), async (req, res) => {
  const playlist = playlists.find((p) => p.id === req.params.playlistId);
  if (!playlist) return res.status(404).json({ error: "Playlist not found" });

  // title and optional audio URL from frontend
  const { title, audioUrl } = req.body;

  const item = {
    id: Date.now().toString(),
    title: title || "Untitled",
    fileUrl: audioUrl || "/uploads/podcasts/" + (req.file?.filename || ""),
  };

  playlist.items.push(item);
  res.json(item);
});

// Delete a playlist completely
router.delete("/playlists/:playlistId", isAdmin, async (req, res) => {
  playlists = playlists.filter((p) => p.id !== req.params.playlistId);
  res.json({ success: true });
});

// Delete an audio item from a playlist
router.delete("/:playlistId/:itemId", isAdmin, async (req, res) => {
  const playlist = playlists.find((p) => p.id === req.params.playlistId);
  if (!playlist) return res.status(404).json({ error: "Playlist not found" });

  playlist.items = playlist.items.filter((item) => item.id !== req.params.itemId);
  res.json({ success: true });
});

export default router;
