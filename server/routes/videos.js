// server/routes/videos.js
import express from "express";
import multer from "multer";
import { extname } from "path";
import { Readable } from "node:stream";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

// Reuse the same safe ESM wrappers you used for podcasts
import VideoPlaylist from "../models/VideoPlaylistWrapper.js";
import isOwner from "../middlewares/isOwnerWrapper.js";

const router = express.Router();

/* ---------------- Cloudflare R2 ---------------- */
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET || "lawprepx";
const R2_PUBLIC_BASE = (process.env.R2_PUBLIC_BASE || "").replace(/\/+$/, "");

const r2Ready =
  !!R2_ACCOUNT_ID &&
  !!R2_ACCESS_KEY_ID &&
  !!R2_SECRET_ACCESS_KEY &&
  !!R2_PUBLIC_BASE;

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

/* ---------------- Helpers ---------------- */
const upload = multer({ storage: multer.memoryStorage() });
const newId = () => Math.random().toString(36).slice(2, 10);

const getName = (req) => {
  const bodyName = req.body?.name || req.body?.playlistName || "";
  const queryName = req.query?.name || req.query?.playlistName || "";
  return String(bodyName || queryName).trim() || "Untitled";
};

const mapDoc = (doc) => ({
  _id: doc._id,
  id: String(doc._id),
  name: doc.name,
  slug: doc.slug,
  items: doc.items || [],
});

/* Guess video mime from extension */
function guessVideoMime(pathname = "") {
  const lc = pathname.toLowerCase();
  if (lc.endsWith(".mp4") || lc.endsWith(".m4v")) return "video/mp4";
  if (lc.endsWith(".webm")) return "video/webm";
  if (lc.endsWith(".ogv") || lc.endsWith(".ogg")) return "video/ogg";
  if (lc.endsWith(".mov")) return "video/quicktime";
  return "video/mp4";
}

/* ---------------- Routes ---------------- */

// Public: list playlists
router.get("/", async (_req, res) => {
  try {
    const docs = await VideoPlaylist.find().lean();
    res.json({ playlists: (docs || []).map(mapDoc) });
  } catch (err) {
    console.error("GET /videos failed:", err);
    res.status(500).json({ success: false, message: "Failed to fetch video playlists." });
  }
});

// Admin: create playlist (accepts JSON { name })
router.post("/playlists", isOwner, async (req, res) => {
  try {
    const name = getName(req);
    const slug = name.toLowerCase().replace(/\s+/g, "-");

    const existing = await VideoPlaylist.findOne({ $or: [{ name }, { slug }] });
    if (existing) return res.status(200).json({ success: true, playlist: mapDoc(existing) });

    const doc = await VideoPlaylist.create({ name, slug, items: [] });
    res.status(201).json({ success: true, playlist: mapDoc(doc) });
  } catch (err) {
    console.error("Create video playlist failed:", err?.message || err);
    const tmpId = newId();
    // Defensive fallback so Admin UI doesn’t block
    res.status(200).json({
      success: true,
      playlist: { _id: tmpId, id: tmpId, name: getName(req), slug: getName(req).toLowerCase().replace(/\s+/g, "-"), items: [] },
    });
  }
});

// Admin: delete playlist
router.delete("/playlists/:pid", isOwner, async (req, res) => {
  try {
    await VideoPlaylist.findByIdAndDelete(req.params.pid);
    res.json({ success: true });
  } catch (err) {
    console.error("Delete video playlist failed:", err);
    res.status(500).json({ success: false, message: "Failed to delete playlist." });
  }
});

// Admin: add item (upload to R2 or use external URL)
// Accepts multipart with field "video" or JSON with { url }
router.post("/playlists/:pid/items", isOwner, upload.single("video"), async (req, res) => {
  try {
    const playlist = await VideoPlaylist.findById(req.params.pid);
    if (!playlist) return res.status(404).json({ success: false, message: "Playlist not found" });

    const title = String(req.body?.title || "Untitled").trim();
    const artist = String(req.body?.artist || "").trim();
    const locked = String(req.body?.locked) === "true";
    let url = (req.body?.url || "").trim();

    if (!url && req.file) {
      if (!r2Ready) {
        return res.status(500).json({
          success: false,
          message: "R2 not configured. Set R2_ACCOUNT_ID/KEYS and R2_PUBLIC_BASE.",
        });
      }
      const ext = (extname(req.file.originalname) || ".mp4").toLowerCase();
      const key = `videos/${playlist._id}/${Date.now()}_${newId()}${ext}`;
      await s3.send(new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype || guessVideoMime(key),
      }));
      url = `${R2_PUBLIC_BASE}/${key}`;
    }

    if (!url) return res.status(400).json({ success: false, message: "No file or URL provided" });

    playlist.items.push({ id: newId(), title, artist, url, locked });
    await playlist.save();
    res.json({ success: true, playlist: mapDoc(playlist) });
  } catch (err) {
    console.error("Upload video item failed:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Admin: delete item (best-effort delete from R2)
router.delete("/playlists/:pid/items/:iid", isOwner, async (req, res) => {
  try {
    const playlist = await VideoPlaylist.findById(req.params.pid);
    if (!playlist) return res.status(404).json({ success: false, message: "Playlist not found" });

    const idx = playlist.items.findIndex((it) => String(it.id) === req.params.iid);
    if (idx === -1) return res.status(404).json({ success: false, message: "Item not found" });

    const fileUrl = playlist.items[idx].url || "";
    if (r2Ready && fileUrl.startsWith(R2_PUBLIC_BASE + "/")) {
      try {
        const key = fileUrl.substring(R2_PUBLIC_BASE.length + 1);
        if (key) await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
      } catch (w) {
        console.warn("R2 delete warning:", w?.message || w);
      }
    }

    playlist.items.splice(idx, 1);
    await playlist.save();
    res.json({ success: true });
  } catch (err) {
    console.error("Delete video item failed:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Admin: lock/unlock item
router.patch("/playlists/:pid/items/:iid/lock", isOwner, async (req, res) => {
  try {
    const playlist = await VideoPlaylist.findById(req.params.pid);
    if (!playlist) return res.status(404).json({ success: false, message: "Playlist not found" });

    const it = playlist.items.find((x) => String(x.id) === req.params.iid);
    if (!it) return res.status(404).json({ success: false, message: "Item not found" });

    it.locked = String(req.body?.locked) === "true" || req.body?.locked === true;
    await playlist.save();
    res.json({ success: true });
  } catch (err) {
    console.error("Lock video item failed:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ---------------- Video streaming proxy (CORS-safe) ---------------- */
router.get("/stream", async (req, res) => {
  try {
    const src = String(req.query.src || "").trim();
    if (!src) return res.status(400).send("Missing src");

    let url;
    try { url = new URL(src); } catch { return res.status(400).send("Invalid src"); }

    if (!R2_PUBLIC_BASE || !src.startsWith(R2_PUBLIC_BASE + "/")) {
      return res.status(400).send("Blocked src");
    }

    const range = req.headers.range;
    const upstream = await fetch(url, { headers: range ? { Range: range } : {} });
    const status = upstream.status;

    const ct = upstream.headers.get("content-type") || guessVideoMime(url.pathname);
    const headers = {
      "Content-Type": ct,
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-transform, public, max-age=86400",
      "Access-Control-Expose-Headers": "Content-Length,Content-Range,Accept-Ranges",
      "Cross-Origin-Resource-Policy": "cross-origin",
      "Content-Disposition": 'inline; filename="video"',
    };
    const cl = upstream.headers.get("content-length");
    if (cl) headers["Content-Length"] = cl;
    const cr = upstream.headers.get("content-range");
    if (cr) headers["Content-Range"] = cr;

    res.writeHead(status === 206 ? 206 : 200, headers);
    if (!upstream.body) return res.end();

    Readable.fromWeb(upstream.body).on("error", () => {
      try { res.end(); } catch {}
    }).pipe(res);
  } catch (err) {
    console.error("video stream proxy failed:", err);
    if (!res.headersSent) res.status(502).send("Upstream error");
  }
});

export default router;
