// server/routes/footer.js
const express = require("express");
const mongoose = require("mongoose");
const { isAdmin } = require("./utils");

const router = express.Router();

/* ---------------- Model ---------------- */
const Footer =
  mongoose.models.Footer ||
  mongoose.model(
    "Footer",
    new mongoose.Schema(
      {
        text: { type: String, default: "" },
        links: [
          {
            label: { type: String, default: "" },
            url: { type: String, default: "" },
          },
        ],
        updatedAt: { type: Date, default: Date.now },
      },
      { timestamps: true }
    )
  );

/* ---------------- GET (public) ---------------- */
router.get("/", async (_req, res) => {
  try {
    const doc = await Footer.findOne().lean();
    res.json({ success: true, footer: doc || null });
  } catch (err) {
    console.error("GET /footer error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch footer." });
  }
});

/* ---------------- PUT (admin only) ---------------- */
router.put("/", isAdmin, async (req, res) => {
  try {
    const { text = "", links = [] } = req.body || {};

    const safeLinks = Array.isArray(links)
      ? links.map((l) => ({
          label: String(l?.label || "").trim(),
          url: String(l?.url || "").trim(),
        }))
      : [];

    const update = {
      text: String(text).trim(),
      links: safeLinks,
      updatedAt: new Date(),
    };

    const doc = await Footer.findOneAndUpdate({}, update, {
      new: true,
      upsert: true,
      setDefaultsOnInsert: true,
    }).lean();

    res.json({ success: true, footer: doc });
  } catch (err) {
    console.error("PUT /footer error:", err);
    res.status(500).json({ success: false, error: "Failed to update footer." });
  }
});

/* ---------------- Error handler ---------------- */
router.use((err, _req, res, _next) => {
  console.error("Footer route error:", err);
  res
    .status(err.status || 500)
    .json({ success: false, message: err.message || "Server error" });
});

module.exports = router;
