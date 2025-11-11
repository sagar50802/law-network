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

        // Links like: [{ label: "About", url: "/about" }, { label: "Privacy", url: "https://..." }]
        links: [
          {
            label: { type: String, default: "" },
            url: { type: String, default: "" },
          },
        ],

        // NEW fields
        address: { type: String, default: "" },
        email: { type: String, default: "" },
        phone: { type: String, default: "" },

        updatedAt: { type: Date, default: Date.now },
      },
      { timestamps: true }
    )
  );

/* ---------------- Helpers ---------------- */
function normalizeLinkUrl(url = "") {
  const v = String(url || "").trim();
  if (!v) return "";

  // Internal links or anchors: keep as is ("/about", "#top")
  if (v.startsWith("/") || v.startsWith("#")) return v;

  // Already has http/https
  if (/^https?:\/\//i.test(v)) return v;

  // Probably external domain, prefix https
  return "https://" + v;
}

function normalizeEmail(email = "") {
  const v = String(email || "").trim();
  if (!v) return "";
  if (v.startsWith("mailto:")) return v;
  if (v.includes("@")) return `mailto:${v}`;
  return v;
}

/* ---------------- GET (public) ---------------- */
router.get("/", async (_req, res) => {
  try {
    const doc = await Footer.findOne().lean();
    res.json({ success: true, footer: doc || null });
  } catch (err) {
    console.error("GET /footer error:", err);
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch footer." });
  }
});

/* ---------------- PUT (admin only) ---------------- */
// You can hit this from Postman for now until you build an admin dashboard.
router.put("/", isAdmin, async (req, res) => {
  try {
    const {
      text = "",
      links = [],
      address = "",
      email = "",
      phone = "",
    } = req.body || {};

    const safeLinks = Array.isArray(links)
      ? links.map((l) => ({
          label: String(l?.label || "").trim(),
          url: normalizeLinkUrl(l?.url || ""),
        }))
      : [];

    const update = {
      text: String(text).trim(),
      links: safeLinks,
      address: String(address).trim(),
      email: normalizeEmail(email),
      phone: String(phone).trim(),
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
    res
      .status(500)
      .json({ success: false, error: "Failed to update footer." });
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
