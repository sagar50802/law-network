// server/routes/qr.js
const express = require("express");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const multer = require("multer");
const { isAdmin } = require("./utils");

const router = express.Router();

const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const DATA_FILE = path.join(DATA_DIR, "qr.json");
const UP_DIR = path.join(ROOT, "uploads", "qr");

// Ensure dirs exist
for (const p of [DATA_DIR, UP_DIR]) fs.mkdirSync(p, { recursive: true });

/* ---------- Default config ---------- */
const defaultConfig = {
  url: "",
  currency: "₹",
  plans: {
    weekly: { label: "Weekly", price: 200 },
    monthly: { label: "Monthly", price: 400 },
    yearly: { label: "Yearly", price: 1000 },
  },
};

async function readJSON() {
  try {
    const raw = await fsp.readFile(DATA_FILE, "utf8");
    return JSON.parse(raw || "{}");
  } catch {
    return { ...defaultConfig };
  }
}
async function writeJSON(data) {
  await fsp.writeFile(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}
async function ensureConfig() {
  const cur = await readJSON();
  const merged = {
    ...defaultConfig,
    ...cur,
    plans: {
      weekly: { ...defaultConfig.plans.weekly, ...(cur.plans?.weekly || {}) },
      monthly: { ...defaultConfig.plans.monthly, ...(cur.plans?.monthly || {}) },
      yearly: { ...defaultConfig.plans.yearly, ...(cur.plans?.yearly || {}) },
    },
  };
  if (JSON.stringify(cur) !== JSON.stringify(merged)) await writeJSON(merged);
  return merged;
}

async function unlinkQuiet(relUrl) {
  if (!relUrl || !relUrl.startsWith("/uploads/qr/")) return;
  const abs = path.join(ROOT, relUrl.replace(/^\//, ""));
  try {
    await fsp.unlink(abs);
  } catch {}
}

/* ---------- Multer setup ---------- */
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UP_DIR),
  filename: (_req, file, cb) => {
    const safe = Date.now() + path.extname(file.originalname || ".png");
    cb(null, safe);
  },
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

/* ---------- CORS setup ---------- */
const allowedOrigins = [
  "http://localhost:5173",
  "http://localhost:3000",
  "https://law-network-client.onrender.com",
  "https://law-network.onrender.com",
];
function setCors(res, originHeader) {
  const origin = allowedOrigins.includes(originHeader)
    ? originHeader
    : allowedOrigins[0];
  res.header("Access-Control-Allow-Origin", origin);
  res.header("Vary", "Origin");
  res.header("Access-Control-Allow-Credentials", "true");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Owner-Key, x-owner-key"
  );
  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS"
  );
  res.header("Cross-Origin-Resource-Policy", "cross-origin");
}
router.use((req, res, next) => {
  setCors(res, req.headers.origin);
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

/* ---------- Routes ---------- */

// GET full config
router.get("/", async (_req, res) => {
  const cfg = await ensureConfig();
  res.json({ success: true, qr: cfg });
});

// GET compact (for overlay)
router.get("/current", async (_req, res) => {
  const cfg = await ensureConfig();
  res.json({
    success: true,
    url: cfg.url,
    currency: cfg.currency,
    plans: cfg.plans,
  });
});

// POST update (admin)
router.post("/", isAdmin, upload.single("image"), async (req, res) => {
  const cfg = await ensureConfig();

  if (req.file) {
    if (cfg.url) await unlinkQuiet(cfg.url);
    cfg.url = `/uploads/qr/${req.file.filename}`;
  }

  const {
    currency,
    weeklyLabel,
    weeklyPrice,
    monthlyLabel,
    monthlyPrice,
    yearlyLabel,
    yearlyPrice,
  } = req.body || {};

  if (currency) cfg.currency = currency;

  const num = (v, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };

  if (typeof weeklyLabel === "string")
    cfg.plans.weekly.label = weeklyLabel || cfg.plans.weekly.label;
  if (typeof monthlyLabel === "string")
    cfg.plans.monthly.label = monthlyLabel || cfg.plans.monthly.label;
  if (typeof yearlyLabel === "string")
    cfg.plans.yearly.label = yearlyLabel || cfg.plans.yearly.label;

  cfg.plans.weekly.price = num(weeklyPrice, cfg.plans.weekly.price);
  cfg.plans.monthly.price = num(monthlyPrice, cfg.plans.monthly.price);
  cfg.plans.yearly.price = num(yearlyPrice, cfg.plans.yearly.price);

  await writeJSON(cfg);
  res.json({ success: true, qr: cfg });
});

// DELETE image
router.delete("/image", isAdmin, async (_req, res) => {
  const cfg = await ensureConfig();
  if (cfg.url) await unlinkQuiet(cfg.url);
  cfg.url = "";
  await writeJSON(cfg);
  res.json({ success: true, qr: cfg });
});

/* ---------- Error handler ---------- */
router.use((err, req, res, _next) => {
  setCors(res, req.headers.origin);
  console.error("QR route error:", err);
  res
    .status(err.status || 500)
    .json({ success: false, message: err.message || "Server error" });
});

module.exports = router;
