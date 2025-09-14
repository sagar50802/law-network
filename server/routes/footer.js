// server/routes/footer.js

/**
 * Footer Routes
 *  - GET    /api/footer        -> fetch current footer (public)
 *  - PUT    /api/footer        -> create/update the single footer (admin-only)
 *
 * Assumptions:
 *  - Mongoose model: ../models/Footer.js
 *    Suggested fields: text (String), links (Array of {label, url}), updatedAt
 *  - Uses isOwner middleware for admin protection
 */

const express = require("express");
const Footer = require("../models/Footer");
const isOwner = require("../middlewares/isOwner");

const router = express.Router();

// ---------------- GET (public) ----------------
router.get("/", async (req, res) => {
  try {
    const doc = await Footer.findOne().lean();
    return res.status(200).json({ ok: true, data: doc ? [doc] : [] });
  } catch (err) {
    console.error("GET /footer error:", err);
    return res.status(500).json({ ok: false, error: "Failed to fetch footer." });
  }
});

// ---------------- PUT (admin only) ----------------
router.put("/", isOwner, async (req, res) => {
  try {
    const { text, links } = req.body || {};

    // Ensure array format for links
    const safeLinks = Array.isArray(links)
      ? links.map((l) => ({
          label: String(l.label || "").trim(),
          url: String(l.url || "").trim(),
        }))
      : [];

    const update = {
      text: String(text || "").trim(),
      links: safeLinks,
      updatedAt: new Date(),
    };

    const doc = await Footer.findOneAndUpdate({}, update, {
      new: true,
      upsert: true, // create if not exists
    });

    return res.status(200).json({ ok: true, data: doc });
  } catch (err) {
    console.error("PUT /footer error:", err);
    return res.status(500).json({ ok: false, error: "Failed to update footer." });
  }
});

module.exports = router;
