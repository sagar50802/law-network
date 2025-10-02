import express from "express";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import multer from "multer";
import { isAdmin } from "./utils.js"; // adjust if your utils path differs
import { fileURLToPath } from "url";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
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
  console.log("=== QR upload ===", req.file); // log upload details

  const cfg = await ensureConfig();

  if (req.file) {
    if (cfg.url) await unlinkQuiet(cfg.url);
    // always save as /uploads/qr/<filename>
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

  // send back full URL as well for immediate preview
  const fullUrl = `${req.protocol}://${req.get("host")}${cfg.url}`;

  res.json({ success: true, qr: { ...cfg, fullUrl } });
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
router.use((err, _req, res, _next) => {
  console.error("QR route error:", err);
  res
    .status(err.status || 500)
    .json({ success: false, message: err.message || "Server error" });
});

export default router;
