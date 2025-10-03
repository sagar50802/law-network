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

/* ---------------- Cloudflare R2 (REQUIRED) ---------------- */
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID;
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY;
const R2_BUCKET = process.env.R2_BUCKET || "lawprepx";
const R2_PUBLIC_BASE = (process.env.R2_PUBLIC_BASE || "").replace(/\/+$/, "");

const canUseR2 =
  !!R2_ACCOUNT_ID && !!R2_ACCESS_KEY_ID && !!R2_SECRET_ACCESS_KEY && !!R2_PUBLIC_BASE;

if (!canUseR2) {
  console.warn(
    "⚠️  R2 is not fully configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE."
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

/* ---------------- Upload (memory) ---------------- */
const upload = multer({ storage: multer.memoryStorage() });

/* ---------------- Helpers ---------------- */
const newId = () => Math.random().toString(36).slice(2, 10);

/* In-memory store:
   [{ _id, id, name, items:[{ id, title, artist, url, locked }] }]
   (Swap to Mongo later without changing the client)
*/
let playlists = [];

/* ---------------- Routes ---------------- */

// List all playlists
router.get("/", (_req, res) => {
  res.json({ playlists });
});

// Create playlist (accepts JSON, x-www-form-urlencoded, or ?name=...)
router.post("/playlists", (req, res) => {
  const nameFromBody =
    (req.body && (req.body.name || req.body.playlistName)) || "";
  const nameFromQuery =
    (req.query && (req.query.name || req.query.playlistName)) || "";
  const name = String(nameFromBody || nameFromQuery).trim() || "Untitled";

  const id = newId();
  const pl = { _id: id, id, name, items: [] };
  playlists.push(pl);

  return res.json({
    success: true,
    playlist: { _id: pl._id, id: pl.id, name: pl.name, items: [] },
  });
});

// Delete playlist
router.delete("/playlists/:pid", (req, res) => {
  const pid = String(req.params.pid);
  playlists = playlists.filter((p) => String(p._id) !== pid);
  res.json({ success: true });
});

// Add item (upload file to R2 OR attach external URL)
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

      // If a file was sent, upload to R2 (required)
      if (!url && req.file) {
        if (!canUseR2) {
          return res.status(500).json({
            success: false,
            message:
              "R2 not configured. Set R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_BASE, R2_BUCKET.",
          });
        }
        const ext = (extname(req.file.originalname) || ".mp3").toLowerCase();
        const key = `podcasts/${pid}/${Date.now()}_${newId()}${ext}`;

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

// Delete item (best-effort delete in R2 if it was uploaded there)
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

  const url = pl.items[idx].url || "";
  if (canUseR2 && url.startsWith(R2_PUBLIC_BASE + "/")) {
    try {
      const key = url.substring(R2_PUBLIC_BASE.length + 1);
      if (key) {
        await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
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
  const locked =
    String(req.body?.locked) === "true" || req.body?.locked === true;

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
