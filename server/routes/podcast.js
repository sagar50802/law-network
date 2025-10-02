// server/routes/podcast.js
import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = express.Router();

// where to save uploaded audio files
const UP_DIR = path.join(process.cwd(), "server", "uploads", "podcasts");
if (!fs.existsSync(UP_DIR)) fs.mkdirSync(UP_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UP_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || ".mp3";
    const base = path.basename(file.originalname, ext).replace(/\s+/g, "_");
    cb(null, Date.now() + "_" + base + ext);
  },
});
const upload = multer({ storage });

// ------- in-memory store (replace with Mongo later) -------
let playlists = []; // [{_id,name,items:[{id,title,artist,url,locked}]}]

// util
function findPl(id) {
  return playlists.find((p) => String(p._id) === String(id));
}
function newId() {
  return Math.random().toString(36).slice(2, 10);
}

// ------- routes -------

// GET /api/podcasts
router.get("/", (req, res) => {
  res.json({ playlists });
});

// POST /api/podcasts/playlists
router.post("/playlists", (req, res) => {
  const name = req.body.name || "Untitled";
  const _id = newId();
  playlists.push({ _id, name, items: [] });
  res.json({ success: true, _id });
});

// DELETE /api/podcasts/playlists/:pid
router.delete("/playlists/:pid", (req, res) => {
  const pid = req.params.pid;
  playlists = playlists.filter((p) => String(p._id) !== String(pid));
  res.json({ success: true });
});

// POST /api/podcasts/playlists/:pid/items  (upload audio)
router.post("/playlists/:pid/items", upload.single("audio"), (req, res) => {
  const pid = req.params.pid;
  const pl = findPl(pid);
  if (!pl)
    return res.status(404).json({ success: false, message: "Playlist not found" });

  const id = newId();
  const title = req.body.title || "Untitled";
  const artist = req.body.artist || "";
  const locked = String(req.body.locked) === "true";

  let url = req.body.url?.trim();
  if (!url && req.file) {
    // local uploaded file served under /uploads
    url = `/uploads/podcasts/${req.file.filename}`;
  }
  if (!url)
    return res.status(400).json({ success: false, message: "No file or URL provided" });

  pl.items.push({ id, title, artist, url, locked });
  res.json({ success: true, id });
});

// DELETE /api/podcasts/playlists/:pid/items/:iid
router.delete("/playlists/:pid/items/:iid", (req, res) => {
  const pid = req.params.pid;
  const iid = req.params.iid;
  const pl = findPl(pid);
  if (!pl) return res.status(404).json({ success: false });
  pl.items = pl.items.filter((it) => String(it.id) !== String(iid));
  res.json({ success: true });
});

// PATCH /api/podcasts/playlists/:pid/items/:iid/lock
router.patch("/playlists/:pid/items/:iid/lock", (req, res) => {
  const pid = req.params.pid;
  const iid = req.params.iid;
  const locked = !!req.body.locked;
  const pl = findPl(pid);
  if (!pl) return res.status(404).json({ success: false });
  const it = pl.items.find((x) => String(x.id) === String(iid));
  if (!it) return res.status(404).json({ success: false });
  it.locked = locked;
  res.json({ success: true });
});

export default router;
