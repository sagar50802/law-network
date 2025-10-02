// server/routes/videos.js
import express from "express";
import path from "path";
import fs from "fs";
import fsp from "fs/promises";
import multer from "multer";
import { isAdmin } from "./utils.js";

const router = express.Router();

/* ---------- paths & helpers ---------- */
const ROOT = path.join(process.cwd(), "server");
const DATA_DIR = path.join(ROOT, "data");
const UP_DIR = path.join(ROOT, "uploads", "videos"); // plural
const DB_FILE = path.join(DATA_DIR, "videos.json");

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
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const findPlaylist = (db, key) =>
  db.playlists.find((p) => (p._id || p.id || p.name) === key);
const publicUrl = (abs) => `/${path.relative(ROOT, abs).replace(/\\/g, "/")}`;

/* ---------- multer ---------- */
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UP_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".mp4";
    cb(null, `${Date.now()}-${uid()}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 800 * 1024 * 1024 } }); // 800MB
const uploadAny = upload.fields([
  { name: "file", maxCount: 1 },
  { name: "video", maxCount: 1 },
  { name: "upload", maxCount: 1 },
]);

function pickUploadedFile(req) {
  if (req.file) return req.file;
  return (
    req.files?.file?.[0] ||
    req.files?.video?.[0] ||
    req.files?.upload?.[0] ||
    (Array.isArray(req.files) && req.files[0]) ||
    null
  );
}

/* ---------- routes ---------- */

// Public: list playlists
router.get("/", async (_req, res) => {
  const db = await readDB();
  console.log("[/api/videos] GET ->", db.playlists.length, "playlists");
  res.json({ success: true, playlists: db.playlists });
});

// Admin: create playlist
router.post("/playlists", isAdmin, express.json(), async (req, res, next) => {
  try {
    const name = (req.body?.name || "").trim();
    console.log("[/api/videos/playlists] POST name:", name);
    if (!name) return res.status(400).json({ success: false, message: "Name required" });

    const db = await readDB();
    const id = name.toLowerCase().replace(/\s+/g, "-") || uid();
    if (findPlaylist(db, id))
      return res.status(409).json({ success: false, message: "Playlist exists" });

    const pl = { id, name, items: [] };
    db.playlists.push(pl);
    await writeDB(db);
    res.json({ success: true, playlist: pl });
  } catch (e) {
    next(e);
  }
});

// Shared add-item handler
async function addItem(req, res) {
  const db = await readDB();
  const key =
    req.params.playlist ||
    req.query.playlist ||
    req.body.playlist ||
    req.body.playlistId ||
    req.body.playlist_id ||
    req.body.pid;

  console.log("[/api/videos/*/items] POST key:", key, "fields:", {
    title: req.body?.title, hasUpload: !!pickUploadedFile(req), url: !!req.body?.url
  });

  if (!key) return res.status(400).json({ success: false, message: "Missing playlist" });

  const pl = findPlaylist(db, key);
  if (!pl) return res.status(404).json({ success: false, message: "Playlist not found" });

  const title = (req.body.title || "Untitled").trim();
  let url = (req.body.url || "").trim();

  const up = pickUploadedFile(req);
  if (up) url = publicUrl(up.path);
  if (!url) return res.status(400).json({ success: false, message: "Video file or url required" });

  const locked =
    typeof req.body.locked === "string"
      ? req.body.locked.toLowerCase() !== "false"
      : req.body.locked === undefined
      ? true
      : !!req.body.locked;

  const it = {
    id: uid(),
    title,
    url,
    locked,
    createdAt: new Date().toISOString(),
  };
  pl.items ||= [];
  pl.items.push(it);
  await writeDB(db);

  console.log("  added item to", key, "->", it.id, it.title, it.url);
  res.json({ success: true, item: it, playlist: pl.id || pl._id || pl.name });
}

/* --- add item endpoints --- */
router.post("/items", isAdmin, uploadAny, addItem);
router.post("/:playlist/items", isAdmin, uploadAny, addItem);
router.post("/playlists/:playlist/items", isAdmin, uploadAny, addItem);
router.post("/", isAdmin, uploadAny, addItem); // fallback

// DELETE one video item
router.delete("/items/:id", isAdmin, async (req, res) => {
  const db = await readDB();
  let removed = null;
  console.log("[/api/videos/items/:id] DELETE", req.params.id);
  for (const pl of db.playlists) {
    const idx = (pl.items || []).findIndex((x) => (x.id || x._id) === req.params.id);
    if (idx >= 0) {
      removed = pl.items[idx];
      pl.items.splice(idx, 1);
      try {
        if (removed?.url?.startsWith("/uploads/videos/")) {
          const abs = path.join(ROOT, removed.url.replace(/^\//, ""));
          if (abs.startsWith(path.join(ROOT, "uploads", "videos"))) {
            await fsp.unlink(abs).catch(() => {});
          }
        }
      } catch {}
      break;
    }
  }
  await writeDB(db);
  res.json({ success: true, removed: !!removed });
});

/* ---------- Error handler ---------- */
router.use((err, req, res, _next) => {
  console.error("Videos route error:", err);
  res
    .status(err.status || 500)
    .json({ success: false, message: err.message || "Server error" });
});

export default router;
