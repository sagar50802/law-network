// server/routes/podcast.js
import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";

const router = express.Router();

/* ---------------- uploads dir ---------------- */
const UP_DIR = path.join(process.cwd(), "server", "uploads", "podcasts");
if (!fs.existsSync(UP_DIR)) fs.mkdirSync(UP_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UP_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || ".mp3";
    const base = path.basename(file.originalname, ext).replace(/\s+/g, "_");
    cb(null, `${Date.now()}_${base}${ext}`);
  },
});
const upload = multer({ storage });

/* ---------------- in-memory store ----------------
   Replace with Mongo later; this makes API work now. */
let playlists = []; // [{ _id, name, items:[{ id, title, artist, url, locked }] }]
const newId = () => Math.random().toString(36).slice(2, 10);
const findPl = (id) => playlists.find((p) => String(p._id) === String(id));

/* ---------------- list playlists ---------------- */
router.get("/", (_req, res) => {
  res.json({ playlists });
});

/* ---------------- create playlist ----------------
   Matches AdminPodcastEditor: POST /podcasts/playlists {name} */
router.post("/playlists", (req, res) => {
  const name = (req.body?.name || "").trim() || "Untitled";
  const _id = newId();
  playlists.push({ _id, name, items: [] });
  res.json({ success: true, _id });
});

/* ---------------- delete playlist ---------------- */
router.delete("/playlists/:pid", (req, res) => {
  const pid = req.params.pid;
  playlists = playlists.filter((p) => String(p._id) !== String(pid));
  res.json({ success: true });
});

/* ---------------- add item (upload or URL) -------
   Matches AdminPodcastEditor uploadItem():
   - POST /podcasts/playlists/:pid/items
   - multipart/form-data with field "audio" for file
   - OR "url" for external mp3
   - plus title, artist, locked ("true"/"false")
-------------------------------------------------- */
router.post("/playlists/:pid/items", upload.single("audio"), (req, res) => {
  const pid = req.params.pid;
  const pl = findPl(pid);
  if (!pl) return res.status(404).json({ success: false, message: "Playlist not found" });

  const id = newId();
  const title = (req.body?.title || "").trim() || "Untitled";
  const artist = (req.body?.artist || "").trim();
  const locked = String(req.body?.locked) === "true";

  let url = req.body?.url?.trim();
  if (!url && req.file) {
    url = `/uploads/podcasts/${req.file.filename}`;
  }
  if (!url) {
    return res.status(400).json({ success: false, message: "No file or URL provided" });
  }

  pl.items.push({ id, title, artist, url, locked });
  res.json({ success: true, id });
});

/* ---------------- delete item ------------------- */
router.delete("/playlists/:pid/items/:iid", (req, res) => {
  const pid = req.params.pid;
  const iid = req.params.iid;
  const pl = findPl(pid);
  if (!pl) return res.status(404).json({ success: false, message: "Playlist not found" });
  pl.items = pl.items.filter((it) => String(it.id) !== String(iid));
  res.json({ success: true });
});

/* ---------------- lock/unlock item -------------- */
router.patch("/playlists/:pid/items/:iid/lock", (req, res) => {
  const pid = req.params.pid;
  const iid = req.params.iid;
  const locked = !!req.body?.locked;

  const pl = findPl(pid);
  if (!pl) return res.status(404).json({ success: false, message: "Playlist not found" });
  const it = pl.items.find((x) => String(x.id) === String(iid));
  if (!it) return res.status(404).json({ success: false, message: "Item not found" });

  it.locked = locked;
  res.json({ success: true });
});

export default router;
