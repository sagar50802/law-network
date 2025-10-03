// server/routes/podcast.js
import express from "express";
import multer from "multer";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import Playlist from "../models/Playlist.js";

const router = express.Router();

/* ---------- Cloudflare R2 ---------- */
const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});
const BUCKET = process.env.R2_BUCKET || "lawprepx";
const PUBLIC_BASE = process.env.R2_PUBLIC_BASE; // e.g. pub-xxxx.r2.dev

/* ---------- Multer (memory) ---------- */
const upload = multer({ storage: multer.memoryStorage() });

/* ---------- List playlists ---------- */
router.get("/", async (_req, res) => {
  try {
    const playlists = await Playlist.find();
    res.json({ playlists });
  } catch (err) {
    console.error("GET /podcasts error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ---------- Create playlist (hardened) ---------- */
router.post("/playlists", async (req, res) => {
  try {
    // accept name from multiple places & types
    let name =
      (typeof req.body === "string" ? req.body : req.body?.name) ??
      req.body?.playlistName ??
      req.query?.name ??
      "";

    if (typeof name !== "string") name = String(name ?? "");
    name = name.trim();

    // if nothing came through (body not parsed, etc), avoid hard-stop 400 — create Untitled
    if (!name) name = "Untitled";

    const playlist = await Playlist.create({ name, items: [] });
    res.json(playlist);
  } catch (err) {
    console.error("POST /podcasts/playlists error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ---------- Delete playlist ---------- */
router.delete("/playlists/:id", async (req, res) => {
  try {
    await Playlist.findByIdAndDelete(req.params.id);
    res.json({ ok: true });
  } catch (err) {
    console.error("DELETE /podcasts/playlists/:id error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ---------- Add item (R2 upload or external URL) ---------- */
router.post("/playlists/:id/items", upload.single("audio"), async (req, res) => {
  try {
    const { title, artist, locked } = req.body;
    let audioUrl = (req.body?.url || "").trim();

    if (!audioUrl && req.file) {
      if (!PUBLIC_BASE) {
        return res.status(500).json({ error: "Missing R2_PUBLIC_BASE env var" });
      }
      const ext = (req.file.originalname.split(".").pop() || "mp3").toLowerCase();
      const key = `podcasts/${Date.now()}_${Math.random()
        .toString(36)
        .slice(2)}.${ext}`;

      await s3.send(
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: key,
          Body: req.file.buffer,
          ContentType: req.file.mimetype || "audio/mpeg",
        })
      );

      audioUrl = `https://${PUBLIC_BASE}/${key}`;
    }

    if (!audioUrl) return res.status(400).json({ error: "No audio URL or file" });

    const playlist = await Playlist.findById(req.params.id);
    if (!playlist) return res.status(404).json({ error: "Playlist not found" });

    playlist.items.push({
      title: title?.trim() || "Untitled",
      artist: artist?.trim() || "",
      url: audioUrl,
      locked: String(locked) === "true",
    });

    await playlist.save();
    res.json({ ok: true, playlist });
  } catch (err) {
    console.error("POST /podcasts/:id/items error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ---------- Delete item ---------- */
router.delete("/playlists/:pid/items/:iid", async (req, res) => {
  try {
    const playlist = await Playlist.findById(req.params.pid);
    if (!playlist) return res.status(404).json({ error: "Playlist not found" });

    const idx = playlist.items.findIndex((it) => String(it._id) === req.params.iid);
    if (idx === -1) return res.status(404).json({ error: "Item not found" });

    // Optional: delete R2 object if it's from your bucket (enable if you want)
    // const split = playlist.items[idx].url.split(".r2.dev/");
    // if (split[1]) {
    //   await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: split[1] }));
    // }

    playlist.items.splice(idx, 1);
    await playlist.save();
    res.json({ ok: true, playlist });
  } catch (err) {
    console.error("DELETE /podcasts/:pid/items/:iid error:", err);
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
