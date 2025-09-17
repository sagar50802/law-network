const express = require("express");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const multer = require("multer");

const router = express.Router();

const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const DATA_FILE = path.join(DATA_DIR, "qr.json");
const UP_DIR = path.join(ROOT, "uploads", "qr");

// Ensure directories exist
for (const p of [DATA_DIR, UP_DIR]) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

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

function isAdmin(req, res, next) {
  const token = (req.headers.authorization || "").replace("Bearer ", "");
  if (token !== req.ADMIN_KEY) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
  next();
}

async function unlinkQuiet(relUrl) {
  if (!relUrl || !relUrl.startsWith("/uploads/qr/")) return;
  const abs = path.join(ROOT, relUrl.replace(/^\//, ""));
  try {
    await fsp.unlink(abs);
  } catch {}
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UP_DIR),
  filename: (_req, file, cb) =>
    cb(null, `${Date.now()}${path.extname(file.originalname || ".png")}`),
});
const upload = multer({ storage, limits: { fileSize: 20 * 1024 * 1024 } });

// ---------------- ROUTES ----------------

// GET full config
router.get("/", async (_req, res) => {
  const cfg = await ensureConfig();
  res.json({ success: true, qr: cfg });
});

// GET compact for overlay
router.get("/current", async (_req, res) => {
  const cfg = await ensureConfig();
  res.json({
    success: true,
    url: cfg.url,
    currency: cfg.currency,
    plans: cfg.plans,
  });
});

// POST update (image + labels/prices)
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

module.exports = router;
