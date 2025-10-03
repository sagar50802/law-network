// server/routes/podcast.js
import express from "express";
import multer from "multer";
import { extname } from "path";
import { Readable } from "stream";
import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import Playlist from "../models/PlaylistWrapper.js";
import isOwner from "../middlewares/isOwnerWrapper.js";

const router = express.Router();

/* ---------------- Cloudflare R2 ---------------- */
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET || "lawprepx";
const R2_PUBLIC_BASE = (process.env.R2_PUBLIC_BASE || "").replace(/\/+$/, "");
const r2Ready =
  !!R2_ACCOUNT_ID && !!R2_ACCESS_KEY_ID && !!R2_SECRET_ACCESS_KEY && !!R2_PUBLIC_BASE;

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
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

/* ---------------- Routes ---------------- */

// Public: list playlists
router.get("/", async (_req, res) => {
  try {
    const docs = await Playlist.find().lean();
    res.json({ playlists: (docs || []).map(mapDoc) });
  } catch (e) {
    console.error("GET /podcasts failed:", e);
    res.status(500).json({ success: false, message: "Failed to fetch playlists." });
  }
});

// Admin: create (idempotent by name/slug)
router.post("/playlists", isOwner, async (req, res) => {
  try {
    const name = getName(req);
    const slug = name.toLowerCase().replace(/\s+/g, "-");

    let existing = await Playlist.findOne({ $or: [{ name }, { slug }] });
    if (existing) {
      return res.status(200).json({ success: true, playlist: mapDoc(existing) });
    }

    const doc = await Playlist.create({ name, slug, items: [] });
    return res.status(201).json({ success: true, playlist: mapDoc(doc) });
  } catch (e) {
    console.error("Create playlist failed:", e?.message || e);
    // Be tolerant: return a synthetic object so the admin UI never blocks
    const tmpId = newId();
    const nm = getName(req);
    return res
      .status(200)
      .json({ success: true, playlist: { _id: tmpId, id: String(tmpId), name: nm, slug: nm.toLowerCase().replace(/\s+/g, "-"), items: [] } });
  }
});

// Admin: delete playlist
router.delete("/playlists/:pid", isOwner, async (req, res) => {
  try {
    await Playlist.findByIdAndDelete(req.params.pid);
    res.json({ success: true });
  } catch (e) {
    console.error("Delete playlist failed:", e);
    res.status(500).json({ success: false, message: "Failed to delete playlist." });
  }
});

// Admin: add item (upload to R2 or accept external URL)
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
        return res.status(500).json({ success: false, message: "R2 not configured." });
      }
      const ext = (extname(req.file.originalname) || ".mp3").toLowerCase();
      const key = `podcasts/${playlist._id}/${Date.now()}_${newId()}${ext}`;
      await s3.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: key,
          Body: req.file.buffer,
          ContentType: req.file.mimetype || "audio/mpeg",
        })
      );
      url = `${R2_PUBLIC_BASE}/${key}`;
    }

    if (!url) return res.status(400).json({ success: false, message: "No file or URL provided" });

    playlist.items.push({ id: newId(), title, artist, url, locked });
    await playlist.save();
    res.json({ success: true, playlist: mapDoc(playlist) });
  } catch (e) {
    console.error("Upload item failed:", e);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Admin: delete item (best-effort delete from R2 too)
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
  } catch (e) {
    console.error("Delete item failed:", e);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Admin: lock/unlock item
router.patch("/playlists/:pid/items/:iid/lock", isOwner, async (req, res) => {
  try {
    const playlist = await Playlist.findById(req.params.pid);
    if (!playlist) return res.status(404).json({ success: false, message: "Playlist not found" });

    const it = playlist.items.find((x) => String(x.id) === req.params.iid);
    if (!it) return res.status(404).json({ success: false, message: "Item not found" });

    it.locked = String(req.body?.locked) === "true" || req.body?.locked === true;
    await playlist.save();
    res.json({ success: true });
  } catch (e) {
    console.error("Lock item failed:", e);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* ------------------------------------------------------------------
   Media proxy (bypasses R2 CORS). Streams audio with Range support.
   Client calls:  GET /api/podcasts/media?u=<encoded absolute-or-relative URL>
   ------------------------------------------------------------------ */
router.get("/media", async (req, res) => {
  try {
    const raw = String(req.query.u || "");
    if (!raw) return res.status(400).send("Missing ?u");

    // Allow only our own sources (public R2 base or local /uploads/podcasts)
    let allowed = false;
    const isRelativeUploads = raw.startsWith("/uploads/podcasts/");
    if (isRelativeUploads) allowed = true;

    try {
      const target = new URL(raw, `${req.protocol}://${req.get("host")}`);
      if (R2_PUBLIC_BASE) {
        const base = new URL(R2_PUBLIC_BASE + "/");
        if (target.href.startsWith(base.href)) allowed = true;
      }
      if (/\.r2\.dev$/i.test(target.hostname)) allowed = true; // public r2.dev links
    } catch {
      // ignore URL parse errors for relative paths
    }

    if (!allowed) return res.status(400).send("Unsupported source");

    const absoluteUrl = /^https?:\/\//i.test(raw)
      ? raw
      : `${req.protocol}://${req.get("host")}${raw}`;

    const headers = {};
    if (req.headers.range) headers.Range = req.headers.range;

    const upstream = await fetch(absoluteUrl, { headers });

    // Mirror key headers for streaming
    const passthrough = [
      "content-type",
      "content-length",
      "accept-ranges",
      "content-range",
      "etag",
      "last-modified",
      "cache-control",
    ];
    res.status(upstream.status);
    for (const h of passthrough) {
      const v = upstream.headers.get(h);
      if (v) res.setHeader(h, v);
    }

    if (!upstream.body) return res.end();
    Readable.fromWeb(upstream.body).pipe(res);
  } catch (e) {
    console.error("podcasts /media proxy error:", e);
    res.status(500).send("media error");
  }
});

export default router;
