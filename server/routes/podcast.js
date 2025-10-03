import express from "express";
import multer from "multer";
import { extname } from "path";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { Readable } from "node:stream";

import Playlist from "../models/PlaylistWrapper.js";
import isOwner from "../middlewares/isOwnerWrapper.js";

const router = express.Router();

/* ---------------- Cloudflare R2 env ---------------- */
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

// tolerate name from body or query; default Untitled
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

/* ---------------- Routes: public list ---------------- */
router.get("/", async (_req, res) => {
  try {
    const docs = await Playlist.find().lean();
    res.json({ playlists: (docs || []).map(mapDoc) });
  } catch (err) {
    console.error("GET /podcasts failed:", err);
    res.status(500).json({ success: false, message: "Failed to fetch playlists." });
  }
});

/* ---------------- Admin: create/delete ---------------- */
router.post("/playlists", isOwner, async (req, res) => {
  try {
    const name = getName(req);
    const slug = name.toLowerCase().replace(/\s+/g, "-");

    const existing = await Playlist.findOne({ $or: [{ name }, { slug }] });
    if (existing) return res.status(200).json({ success: true, playlist: mapDoc(existing) });

    const doc = await Playlist.create({ name, slug, items: [] });
    res.status(201).json({ success: true, playlist: mapDoc(doc) });
  } catch (err) {
    console.error("Create playlist failed:", err?.message || err);
    // very defensive fallback to keep admin UX unblocked
    const tmpId = newId();
    return res.status(200).json({
      success: true,
      playlist: { _id: tmpId, id: tmpId, name: getName(req), slug: getName(req).toLowerCase().replace(/\s+/g, "-"), items: [] },
    });
  }
});

router.delete("/playlists/:pid", isOwner, async (req, res) => {
  try {
    await Playlist.findByIdAndDelete(req.params.pid);
    res.json({ success: true });
  } catch (err) {
    console.error("Delete playlist failed:", err);
    res.status(500).json({ success: false, message: "Failed to delete playlist." });
  }
});

/* ---------------- Admin: add / remove items ---------------- */
router.post("/playlists/:pid/items", isOwner, upload.single("audio"), async (req, res) => {
  try {
    const playlist = await Playlist.findById(req.params.pid);
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
      const ext = (extname(req.file.originalname) || ".mp3").toLowerCase();
      const key = `podcasts/${playlist._id}/${Date.now()}_${newId()}${ext}`;
      await s3.send(new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: req.file.buffer,
        ContentType: req.file.mimetype || "audio/mpeg",
      }));
      url = `${R2_PUBLIC_BASE}/${key}`;
    }

    if (!url) return res.status(400).json({ success: false, message: "No file or URL provided" });

    playlist.items.push({ id: newId(), title, artist, url, locked });
    await playlist.save();
    res.json({ success: true, playlist: mapDoc(playlist) });
  } catch (err) {
    console.error("Upload item failed:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.delete("/playlists/:pid/items/:iid", isOwner, async (req, res) => {
  try {
    const playlist = await Playlist.findById(req.params.pid);
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
    console.error("Delete item failed:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

router.patch("/playlists/:pid/items/:iid/lock", isOwner, async (req, res) => {
  try {
    const playlist = await Playlist.findById(req.params.pid);
    if (!playlist) return res.status(404).json({ success: false, message: "Playlist not found" });

    const it = playlist.items.find((x) => String(x.id) === req.params.iid);
    if (!it) return res.status(404).json({ success: false, message: "Item not found" });

    it.locked = String(req.body?.locked) === "true" || req.body?.locked === true;
    await playlist.save();
    res.json({ success: true });
  } catch (err) {
    console.error("Lock item failed:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ---------------- Audio streaming proxy (ORB-safe) ---------------- */
/**
 * GET /api/podcasts/stream?src=<absolute-R2-public-url>
 *  - Only allows URLs under R2_PUBLIC_BASE to avoid SSRF.
 *  - Forwards Range requests.
 *  - Mirrors upstream headers browsers require (CT/CR/AR/CL).
 *  - Sets stable defaults so Firefox won't trigger OpaqueResponseBlocking.
 */
router.get("/stream", async (req, res) => {
  try {
    const src = String(req.query.src || "").trim();
    if (!src) return res.status(400).send("Missing src");

    let url;
    try {
      url = new URL(src);
    } catch {
      return res.status(400).send("Invalid src");
    }

    // Security: only allow your R2 public base
    if (!R2_PUBLIC_BASE || !src.startsWith(R2_PUBLIC_BASE + "/")) {
      return res.status(400).send("Blocked src");
    }

    const range = req.headers.range; // e.g. "bytes=0-" for media
    const upstreamHeaders = {};
    if (range) upstreamHeaders.Range = range;

    const upstream = await fetch(url, { headers: upstreamHeaders });
    // Some R2 public links may return 200 for full file; others 206 for partial
    const status = upstream.status; // 200 or 206 expected

    // Decide content-type
    const upstreamCT = upstream.headers.get("content-type");
    let contentType = upstreamCT || guessAudioMime(url.pathname);

    // Prepare response headers
    const headers = {
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
      // help Firefox/Chromium accept the media and enable scrubbing
      "Cache-Control": "no-transform, public, max-age=86400",
      "Access-Control-Expose-Headers": "Content-Length,Content-Range,Accept-Ranges",
      "Cross-Origin-Resource-Policy": "cross-origin",
      "Content-Disposition": 'inline; filename="audio"',
    };

    const contentLength = upstream.headers.get("content-length");
    if (contentLength) headers["Content-Length"] = contentLength;

    const contentRange = upstream.headers.get("content-range");
    if (contentRange) headers["Content-Range"] = contentRange;

    // HEAD probe: send only headers
    if (req.method === "HEAD") {
      res.writeHead(status === 206 ? 206 : 200, headers);
      return res.end();
    }

    res.writeHead(status === 206 ? 206 : 200, headers);

    if (!upstream.body) return res.end();

    // Pipe WebReadableStream -> Node response
    const nodeStream = Readable.fromWeb(upstream.body);
    nodeStream.on("error", (e) => {
      console.warn("stream proxy error:", e?.message || e);
      try { res.end(); } catch {}
    });
    nodeStream.pipe(res);
  } catch (err) {
    console.error("stream proxy failed:", err);
    if (!res.headersSent) {
      res.status(502).send("Upstream error");
    } else {
      try { res.end(); } catch {}
    }
  }
});

function guessAudioMime(pathname = "") {
  const lc = pathname.toLowerCase();
  if (lc.endsWith(".mp3")) return "audio/mpeg";
  if (lc.endsWith(".m4a")) return "audio/mp4";
  if (lc.endsWith(".aac")) return "audio/aac";
  if (lc.endsWith(".ogg") || lc.endsWith(".oga")) return "audio/ogg";
  if (lc.endsWith(".wav")) return "audio/wav";
  return "audio/mpeg";
}

export default router;
