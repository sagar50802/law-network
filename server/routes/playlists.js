const express = require("express");
const Playlist = require("../models/Playlist");
const isOwner = require("../middlewares/isOwner");

const router = express.Router();

// Public GET
router.get("/", async (_req, res) => {
  try {
    const playlists = await Playlist.find().lean();
    res.json({ ok: true, data: playlists });
  } catch {
    res.status(500).json({ ok: false, error: "Failed to fetch playlists." });
  }
});

// Admin-only POST
router.post("/", isOwner, async (req, res) => {
  try {
    if (!req.body.name) return res.status(400).json({ ok: false, error: "Name required" });

    const doc = await Playlist.create({
      name: req.body.name,
      slug: req.body.name.toLowerCase().replace(/\s+/g, "-"),
      locked: String(req.body.locked).toLowerCase() === "true",
      price: req.body.price || undefined,
    });

    res.status(201).json({ ok: true, data: doc });
  } catch {
    res.status(500).json({ ok: false, error: "Failed to create playlist." });
  }
});

// Admin-only DELETE
router.delete("/:id", isOwner, async (req, res) => {
  try {
    const doc = await Playlist.findByIdAndDelete(req.params.id).lean();
    if (!doc) return res.status(404).json({ ok: false, error: "Not found" });
    res.json({ ok: true, data: { deleted: true } });
  } catch {
    res.status(500).json({ ok: false, error: "Failed to delete playlist." });
  }
});

// Admin-only PATCH
router.patch("/:id/lock", isOwner, async (req, res) => {
  try {
    const update = {};
    if (req.body.locked !== undefined) update.locked = String(req.body.locked).toLowerCase() === "true";
    if (req.body.price !== undefined) update.price = req.body.price;

    const doc = await Playlist.findByIdAndUpdate(req.params.id, { $set: update }, { new: true }).lean();
    if (!doc) return res.status(404).json({ ok: false, error: "Not found" });
    res.json({ ok: true, data: doc });
  } catch {
    res.status(500).json({ ok: false, error: "Failed to update playlist." });
  }
});

module.exports = router;
