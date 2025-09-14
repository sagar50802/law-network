const express = require("express");
const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");
const multer = require("multer");

const router = express.Router();

/* ---------- paths & helpers ---------- */
const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const UP_DIR = path.join(ROOT, "uploads", "podcasts");
const DB_FILE = path.join(DATA_DIR, "podcasts.json");

for (const p of [DATA_DIR, UP_DIR]) fs.mkdirSync(p, { recursive: true });

async function readDB() {
  try {
    const raw = await fsp.readFile(DB_FILE, "utf8");
    const json = JSON.parse(raw || "{}");
    json.playlists ||= [];
    return json;
  } catch {
    return { playlists: [] };
  }
}
async function writeDB(db) {
  await fsp.writeFile(DB_FILE, JSON.stringify(db, null, 2), "utf8");
}
function uid() { return Math.random().toString(36).slice(2) + Date.now().toString(36); }
function findPlaylist(db, key) { return db.playlists.find(p => (p._id || p.id || p.name) === key); }
function publicUrl(abs) { return `/${path.relative(ROOT, abs).replace(/\\/g, "/")}`; }

/* ---------- multer setup ---------- */
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UP_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".mp3";
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 200 * 1024 * 1024 } });
const uploadAny = upload.fields([
  { name: "file",   maxCount: 1 },
  { name: "audio",  maxCount: 1 },
  { name: "upload", maxCount: 1 },
]);

/* ---------- routes ---------- */

// list playlists
router.get("/", async (_req, res) => {
  const db = await readDB();
  res.json({ success: true, playlists: db.playlists });
});

// create playlist — JSON ONLY at /playlists
router.post("/playlists", express.json(), async (req, res, next) => {
  try {
    const name = (req.body?.name || "").trim();
    if (!name) return res.status(400).json({ success: false, message: "Name required" });
    const db = await readDB();
    const id = name.toLowerCase().replace(/\s+/g, "-") || uid();
    if (findPlaylist(db, id)) return res.status(409).json({ success: false, message: "Playlist exists" });
    const pl = { id, name, items: [] };
    db.playlists.push(pl);
    await writeDB(db);
    res.json({ success: true, playlist: pl });
  } catch (e) { next(e); }
});

// pick uploaded file regardless of field name
function pickUploadedFile(req) {
  if (req.file) return req.file;
  return (
    req.files?.file?.[0] ||
    req.files?.audio?.[0] ||
    req.files?.upload?.[0] ||
    (Array.isArray(req.files) && req.files[0]) ||
    null
  );
}

// add item helper
async function addItem(req, res) {
  const db = await readDB();

  const key =
    req.params.playlist ||
    req.query.playlist ||
    req.body.playlist ||
    req.body.playlistId ||
    req.body.playlist_id ||
    req.body.pid;

  if (!key) return res.status(400).json({ success: false, message: "Missing playlist" });

  const pl = findPlaylist(db, key);
  if (!pl) return res.status(404).json({ success: false, message: "Playlist not found" });

  const title = (req.body.title || "Untitled").trim();
  // accept either "author" (admin) or "artist" (public page)
  const authorOrArtist = (req.body.artist || req.body.author || "").trim();

  let url = (req.body.url || req.body.audioUrl || "").trim();
  const up = pickUploadedFile(req);
  if (up) url = publicUrl(up.path);
  if (!url) return res.status(400).json({ success: false, message: "Audio file or url required" });

  // default locked=true unless explicitly set false
  const locked =
    typeof req.body.locked === "string"
      ? req.body.locked.toLowerCase() !== "false"
      : req.body.locked === undefined
        ? true
        : !!req.body.locked;

  const it = {
    id: uid(),
    title,
    author: authorOrArtist,
    artist: authorOrArtist,
    url,
    locked,
    createdAt: new Date().toISOString()
  };
  pl.items ||= [];
  pl.items.push(it);
  await writeDB(db);

  res.json({ success: true, item: it, playlist: pl.id || pl._id || pl.name });
}

/* ---- add item endpoints (cover Admin + public page) ---- */

// preferred from Admin UI
router.post("/items", uploadAny, addItem);

// path-carries-playlist
router.post("/:playlist/items", uploadAny, addItem);

// compatibility with public page: /playlists/:playlist/items
router.post("/playlists/:playlist/items", uploadAny, addItem);

// universal fallback (multipart with 'playlist' in body)
router.post("/", uploadAny, addItem);

/* ---------- delete + lock ---------- */

// delete by item id (admin uses this)
router.delete("/items/:id", async (req, res) => {
  const db = await readDB();
  let removed = null;
  for (const pl of db.playlists) {
    const idx = (pl.items || []).findIndex(x => (x.id || x._id) === req.params.id);
    if (idx >= 0) {
      removed = pl.items[idx];
      pl.items.splice(idx, 1);
      try {
        if (removed.url?.startsWith("/uploads/podcasts/")) {
          const abs = path.join(ROOT, removed.url.replace(/^\//, ""));
          await fsp.unlink(abs).catch(() => {});
        }
      } catch {}
      break;
    }
  }
  await writeDB(db);
  res.json({ success: true, removed: !!removed });
});

// delete compat: /playlists/:playlist/items/:id (used by public page)
router.delete("/playlists/:playlist/items/:id", async (req, res) => {
  const db = await readDB();
  const pl = findPlaylist(db, req.params.playlist);
  let removed = null;

  if (pl) {
    const idx = (pl.items || []).findIndex(x => (x.id || x._id) === req.params.id);
    if (idx >= 0) {
      removed = pl.items[idx];
      pl.items.splice(idx, 1);
    }
  }

  // if not found under that playlist, fall back to global search
  if (!removed) {
    for (const p of db.playlists) {
      const idx = (p.items || []).findIndex(x => (x.id || x._id) === req.params.id);
      if (idx >= 0) {
        removed = p.items[idx];
        p.items.splice(idx, 1);
        break;
      }
    }
  }

  try {
    if (removed?.url?.startsWith("/uploads/podcasts/")) {
      const abs = path.join(ROOT, removed.url.replace(/^\//, ""));
      await fsp.unlink(abs).catch(() => {});
    }
  } catch {}

  await writeDB(db);
  res.json({ success: true, removed: !!removed });
});

// lock/unlock compat: /playlists/:playlist/items/:id/lock
router.patch("/playlists/:playlist/items/:id/lock", express.json(), async (req, res) => {
  const db = await readDB();
  const pl = findPlaylist(db, req.params.playlist);
  if (!pl) return res.status(404).json({ success: false, message: "Playlist not found" });

  const it = (pl.items || []).find(x => (x.id || x._id) === req.params.id);
  if (!it) return res.status(404).json({ success: false, message: "Item not found" });

  const locked =
    typeof req.body.locked === "string"
      ? req.body.locked.toLowerCase() !== "false"
      : !!req.body.locked;

  it.locked = locked;
  await writeDB(db);
  res.json({ success: true, item: it });
});

// delete playlist
router.delete("/:playlist", async (req, res) => {
  const db = await readDB();
  const idx = db.playlists.findIndex(p => (p._id || p.id || p.name) === req.params.playlist);
  if (idx < 0) return res.status(404).json({ success: false, message: "Playlist not found" });

  const pl = db.playlists[idx];
  for (const it of pl.items || []) {
    try {
      if (it.url?.startsWith("/uploads/podcasts/")) {
        const abs = path.join(ROOT, it.url.replace(/^\//, ""));
        await fsp.unlink(abs).catch(() => {});
      }
    } catch {}
  }
  db.playlists.splice(idx, 1);
  await writeDB(db);
  res.json({ success: true });
});

module.exports = router;
