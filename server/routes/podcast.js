// server/routes/podcast.js
import express from "express";
import multer from "multer";
import { extname } from "path";
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

const router = express.Router();

/* ---------------- Cloudflare R2 ---------------- */
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET || "lawprepx";
const R2_PUBLIC_BASE = (process.env.R2_PUBLIC_BASE || "").replace(/\/+$/, "");

if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) {
  console.warn(
    "⚠️ R2 credentials missing. Uploads will fail until env vars are set: R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY"
  );
}

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

/* ---------------- Storage helpers ---------------- */
const upload = multer({ storage: multer.memoryStorage() });

const newId = () => Math.random().toString(36).slice(2, 10);
const normalizeName = (req) =>
  String(req.body?.name || req.body?.playlistName || "").trim();

/* ---------------- In-memory playlists ----------------
   [{ _id, name, items:[{ id, title, artist, url, locked }] }]
   (You can swap to Mongo later without changing the client)
------------------------------------------------------ */
let playlists = [];

/* ---------------- Routes ---------------- */

// List all playlists
router.get("/", (_req, res) => {
  res.json({ playlists });
});

// Create playlist (accepts JSON or x-www-form-urlencoded)
router.post("/playlists", (req, res) => {
  const name = normalizeName(req);
  if (!name) {
    return res
      .status(400)
      .json({ success: false, message: "Playlist name is required" });
  }
  const _id = newId();
  const pl = { _id, name, items: [] };
  playlists.push(pl);
  res.json({ success: true, playlist: pl });
});

// Delete playlist
router.delete("/playlists/:pid", (req, res) => {
  const pid = String(req.params.pid);
  playlists = playlists.filter((p) => String(p._id) !== pid);
  res.json({ success: true });
});

// Add item (upload file to R2 OR use external URL)
router.post(
  "/playlists/:pid/items",
  upload.single("audio"),
  async (req, res) => {
    try {
      const pid = String(req.params.pid);
      const pl = playlists.find((p) => String(p._id) === pid);
      if (!pl)
        return res
          .status(404)
          .json({ success: false, message: "Playlist not found" });

      const title = String(req.body?.title || "Untitled").trim();
      const artist = String(req.body?.artist || "").trim();
      const locked = String(req.body?.locked) === "true";

      let url = (req.body?.url || "").trim();

      if (!url && req.file) {
        if (!R2_PUBLIC_BASE) {
          return res.status(500).json({
            success: false,
            message:
              "R2_PUBLIC_BASE not set. Set it to your public base (e.g. https://pub-xxxxxx.r2.dev)",
          });
        }
        const ext = extname(req.file.originalname || "").toLowerCase() || ".mp3";
        const key = `podcasts/${Date.now()}_${newId()}${ext}`;

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
        return res
          .status(400)
          .json({ success: false, message: "No file or URL provided" });
      }

      const item = { id: newId(), title, artist, url, locked };
      pl.items.push(item);

      res.json({ success: true, id: item.id, playlist: pl });
    } catch (err) {
      console.error("Upload item failed:", err);
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
);

// Delete item (also tries to delete from R2 if URL matches your bucket)
router.delete("/playlists/:pid/items/:iid", async (req, res) => {
  const pid = String(req.params.pid);
  const iid = String(req.params.iid);
  const pl = playlists.find((p) => String(p._id) === pid);
  if (!pl)
    return res
      .status(404)
      .json({ success: false, message: "Playlist not found" });

  const idx = pl.items.findIndex((it) => String(it.id) === iid);
  if (idx === -1)
    return res
      .status(404)
      .json({ success: false, message: "Item not found" });

  // Best-effort delete from R2 (only if it’s your R2 public base)
  const url = pl.items[idx].url || "";
  if (R2_PUBLIC_BASE && url.startsWith(R2_PUBLIC_BASE)) {
    try {
      // derive object key from URL
      const key = url.substring(R2_PUBLIC_BASE.length + 1);
      if (key) {
        await s3.send(
          new DeleteObjectCommand({
            Bucket: R2_BUCKET,
            Key: key,
          })
        );
      }
    } catch (e) {
      console.warn("R2 delete warning:", e?.message || e);
    }
  }

  pl.items.splice(idx, 1);
  res.json({ success: true });
});

// Lock/unlock item
router.patch("/playlists/:pid/items/:iid/lock", (req, res) => {
  const pid = String(req.params.pid);
  const iid = String(req.params.iid);
  const locked = String(req.body?.locked) === "true" || req.body?.locked === true;

  const pl = playlists.find((p) => String(p._id) === pid);
  if (!pl)
    return res
      .status(404)
      .json({ success: false, message: "Playlist not found" });

  const it = pl.items.find((x) => String(x.id) === iid);
  if (!it)
    return res
      .status(404)
      .json({ success: false, message: "Item not found" });

  it.locked = locked;
  res.json({ success: true });
});

export default router;
