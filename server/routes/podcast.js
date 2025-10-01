import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// simple owner-key check
function isAdmin(req, res, next) {
  const key = req.headers["x-owner-key"];
  if (!key || key !== process.env.VITE_OWNER_KEY) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
  next();
}

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// local uploads folder
const UP_DIR = path.join(__dirname, "..", "uploads", "podcasts");
if (!fs.existsSync(UP_DIR)) fs.mkdirSync(UP_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UP_DIR),
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname),
});
const upload = multer({ storage });

// fake in-memory playlists for now
let playlists = [];

// GET playlists
router.get("/playlists", (req, res) => {
  res.json({ success: true, playlists });
});

// POST create playlist
router.post("/playlists", isAdmin, express.json(), (req, res) => {
  const { name } = req.body;
  if (!name) return res.status(400).json({ success: false, message: "Name required" });
  const pl = { id: Date.now().toString(), name, items: [] };
  playlists.push(pl);
  res.json({ success: true, playlist: pl });
});

// upload a podcast file
router.post("/:playlistId/upload", isAdmin, upload.single("file"), (req, res) => {
  const { playlistId } = req.params;
  const pl = playlists.find((p) => p.id === playlistId);
  if (!pl) return res.status(404).json({ success: false, message: "Playlist not found" });

  const fileUrl = `/uploads/podcasts/${path.basename(req.file.path)}`;
  const item = { id: Date.now().toString(), title: req.body.title || req.file.originalname, url: fileUrl };
  pl.items.push(item);

  res.json({ success: true, item });
});

export default router;
