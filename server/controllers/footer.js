// server/controllers/footer.js

/**
 * Footer Controller
 * - getFooter: returns current footer info (or default empty structure)
 * - setFooter: updates footer info (admin-only via OWNER_KEY)
 */

const Footer = require("../models/FooterInfo");

// --------- Helpers ----------
const pick = (obj, keys) =>
  keys.reduce((acc, k) => {
    if (Object.prototype.hasOwnProperty.call(obj || {}, k)) acc[k] = obj[k];
    return acc;
  }, {});

const trimStr = (v) => (typeof v === "string" ? v.trim() : v);

const normalizeCourses = (arr = []) =>
  (Array.isArray(arr) ? arr : []).map((c) => ({
    imagePath: trimStr(c?.imagePath || ""),
    title: trimStr(c?.title || ""),
    summary: trimStr(c?.summary || ""),
  }));

const defaultFooter = () => ({
  address: "",
  phone: "",
  gmail: "",
  whatsapp: "",
  telegram: "",
  instagram: "",
  courses: [],
  refundPdfPath: "",
  termsPdfPath: "",
  updatedAt: null,
});

// --------- Controllers ----------

// GET /api/footer
async function getFooter(req, res) {
  try {
    res.set("Cache-Control", "public, max-age=300, s-maxage=300");

    const doc = await Footer.findOne({}).lean();
    if (!doc) {
      return res.status(200).json({ ok: true, data: defaultFooter() });
    }

    return res.status(200).json({
      ok: true,
      data: {
        address: doc.address || "",
        phone: doc.phone || "",
        gmail: doc.gmail || "",
        whatsapp: doc.whatsapp || "",
        telegram: doc.telegram || "",
        instagram: doc.instagram || "",
        courses: Array.isArray(doc.courses) ? doc.courses : [],
        refundPdfPath: doc.refundPdfPath || "",
        termsPdfPath: doc.termsPdfPath || "",
        updatedAt: doc.updatedAt || doc.createdAt || null,
      },
    });
  } catch (err) {
    console.error("getFooter error:", err);
    return res.status(500).json({ ok: false, error: "Failed to fetch footer." });
  }
}

// PUT /api/footer
async function setFooter(req, res) {
  try {
    // Admin guard
    const headerKey = String(req.headers["x-owner-key"] || "");
    const ownerKey = String(process.env.OWNER_KEY || "");
    const isOwner = Boolean(req.isOwner || (ownerKey && headerKey === ownerKey));

    if (!isOwner) {
      return res.status(403).json({ ok: false, error: "Forbidden" });
    }

    const allowed = [
      "address",
      "phone",
      "gmail",
      "whatsapp",
      "telegram",
      "instagram",
      "courses",
      "refundPdfPath",
      "termsPdfPath",
    ];

    const body = pick(req.body || {}, allowed);

    const payload = {
      address: trimStr(body.address || ""),
      phone: trimStr(body.phone || ""),
      gmail: trimStr(body.gmail || ""),
      whatsapp: trimStr(body.whatsapp || ""),
      telegram: trimStr(body.telegram || ""),
      instagram: trimStr(body.instagram || ""),
      courses: normalizeCourses(body.courses),
      refundPdfPath: trimStr(body.refundPdfPath || ""),
      termsPdfPath: trimStr(body.termsPdfPath || ""),
    };

    const updated = await Footer.findOneAndUpdate(
      {},
      { $set: payload, $currentDate: { updatedAt: true } },
      { new: true, upsert: true }
    ).lean();

    return res.status(200).json({ ok: true, data: updated });
  } catch (err) {
    console.error("setFooter error:", err);
    return res.status(500).json({ ok: false, error: "Failed to save footer." });
  }
}

module.exports = {
  getFooter,
  setFooter,
};
