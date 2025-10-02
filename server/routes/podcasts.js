// server/routes/podcasts.js
import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { isAdmin } from "./utils.js"; // ✅ make sure you already have isAdmin

const router = express.Router();

// ---------- Storage setup ----------
const UP_DIR = path.join(process.cwd(), "server", "uploads", "podcasts");
fs.mkdirSync(UP_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UP_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now() + "-" + Math.round(Math.random() * 1e9) + ext);
  },
});
const upload = multer({ storage });

// ---------- In-memory DB (replace with Mongo later if needed) ----------
let playlists = []; 
// [{ _id, name, items: [ { id, title, artist, url, locked } ] }]

// ---------- Routes ----------

// List all playlists
router.get("/", (req, res) => {
  res.json({ success: true, playlists });
});

// Create playlist
router.post("/playlists", isAdmin, express.json(), (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ error: "name required" });
  const _id = Date.now().toString(36) + Math.random().toString(36).slice(2);
  const playlist = { _id, name, items: [] };
  playlists.push(playlist);
  res.json({ success: true, playlist });
});

// Delete playlist
router.delete("/playlists/:id", isAdmin, (req, res) => {
  const { id } = req.params;
  playlists = playlists.filter((p) => p._id !== id);
  res.json({ success: true });
});

// Upload audio item
router.post("/playlists/:id/items", isAdmin, upload.single("audio"), (req, res) => {
  const { id } = req.params;
  const pl = playlists.find((p) => p._id === id);
  if (!pl) return res.status(404).json({ error: "playlist not found" });

  const { title, artist, locked, url } = req.body;
  if (!req.file && !url) {
    return res.status(400).json({ error: "audio file or url required" });
  }

  const fileUrl = req.file ? `/uploads/podcasts/${req.file.filename}` : url;

  const itemId = Date.now().toString(36) + Math.random().toString(36).slice(2);
  const item = {
    id: itemId,
    title: title || "Untitled",
    artist: artist || "",
    locked: String(locked) === "true",
    url: fileUrl,
  };

  pl.items.push(item);
  res.json({ success: true, item });
});

// Delete audio item
router.delete("/playlists/:pid/items/:iid", isAdmin, (req, res) => {
  const { pid, iid } = req.params;
  const pl = playlists.find((p) => p._id === pid);
  if (!pl) return res.status(404).json({ error: "playlist not found" });
  pl.items = pl.items.filter((i) => i.id !== iid);
  res.json({ success: true });
});

// Toggle lock/unlock
router.patch("/playlists/:pid/items/:iid/lock", isAdmin, express.json(), (req, res) => {
  const { pid, iid } = req.params;
  const pl = playlists.find((p) => p._id === pid);
  if (!pl) return res.status(404).json({ error: "playlist not found" });
  const item = pl.items.find((i) => i.id === iid);
  if (!item) return res.status(404).json({ error: "item not found" });
  item.locked = !!req.body.locked;
  res.json({ success: true, item });
});

export default router;
