// server/routes/podcast.js
import express from "express";
import multer from "multer";
import { extname } from "path";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

// Use wrappers so we DO NOT modify your existing files
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
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

/* ---------------- Helpers ---------------- */
const upload = multer({ storage: multer.memoryStorage() });
const newId = () => Math.random().toString(36).slice(2, 10);

// Read from JSON, x-www-form-urlencoded, or query; if blank → "Untitled"
const getName = (req) => {
  const bodyName  = req.body?.name || req.body?.playlistName || "";
  const queryName = req.query?.name || req.query?.playlistName || "";
  return String(bodyName || queryName).trim() || "Untitled";
};

/* ---------------- Routes ---------------- */

// Public: list playlists
router.get("/", async (_req, res) => {
  try {
    const playlists = await Playlist.find().lean();
    res.json({ playlists });
  } catch (err) {
    console.error("GET /podcasts failed:", err);
    res.status(500).json({ success: false, message: "Failed to fetch playlists." });
  }
});

// Admin: create playlist (tolerant name handling)
router.post("/playlists", isOwner, async (req, res) => {
  try {
    const name = getName(req);
    const slug = name.toLowerCase().replace(/\s+/g, "-");
    const doc = await Playlist.create({ name, slug, items: [] });
    res.status(201).json({
      success: true,
      playlist: {
        _id: doc._id,
        id: String(doc._id), // your client accepts _id or id
        name: doc.name,
        items: doc.items || [],
      },
    });
  } catch (err) {
    console.error("Create playlist failed:", err);
    res.status(500).json({ success: false, message: "Failed to create playlist." });
  }
});

// Admin: delete playlist
router.delete("/playlists/:pid", isOwner, async (req, res) => {
  try {
    await Playlist.findByIdAndDelete(req.params.pid);
    res.json({ success: true });
  } catch (err) {
    console.error("Delete playlist failed:", err);
    res.status(500).json({ success: false, message: "Failed to delete playlist." });
  }
});

// Admin: add item (upload to R2 or use external URL)
router.post(
  "/playlists/:pid/items",
  isOwner,
  upload.single("audio"),
  async (req, res) => {
    try {
      const playlist = await Playlist.findById(req.params.pid);
      if (!playlist)
        return res.status(404).json({ success: false, message: "Playlist not found" });

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

      if (!url) {
        return res.status(400).json({ success: false, message: "No file or URL provided" });
      }

      playlist.items.push({ id: newId(), title, artist, url, locked });
      await playlist.save();
      res.json({ success: true, playlist });
    } catch (err) {
      console.error("Upload item failed:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

// Admin: delete item (best-effort delete from R2)
router.delete("/playlists/:pid/items/:iid", isOwner, async (req, res) => {
  try {
    const playlist = await Playlist.findById(req.params.pid);
    if (!playlist)
      return res.status(404).json({ success: false, message: "Playlist not found" });

    const idx = playlist.items.findIndex((it) => String(it.id) === req.params.iid);
    if (idx === -1)
      return res.status(404).json({ success: false, message: "Item not found" });

    const fileUrl = playlist.items[idx].url || "";
    if (r2Ready && fileUrl.startsWith(R2_PUBLIC_BASE + "/")) {
      try {
        const key = fileUrl.substring(R2_PUBLIC_BASE.length + 1);
        if (key) await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
      } catch (e) {
        console.warn("R2 delete warning:", e?.message || e);
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

// Admin: lock/unlock item
router.patch("/playlists/:pid/items/:iid/lock", isOwner, async (req, res) => {
  try {
    const playlist = await Playlist.findById(req.params.pid);
    if (!playlist)
      return res.status(404).json({ success: false, message: "Playlist not found" });

    const it = playlist.items.find((x) => String(x.id) === req.params.iid);
    if (!it)
      return res.status(404).json({ success: false, message: "Item not found" });

    it.locked = String(req.body?.locked) === "true" || req.body?.locked === true;
    await playlist.save();
    res.json({ success: true });
  } catch (err) {
    console.error("Lock item failed:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

export default router;
