import express from "express";
import fs from "fs";
import fsp from "fs/promises";
import path from "path";
import multer from "multer";
import { fileURLToPath } from "url";
import { isAdmin } from "./utils.js"; // adjust if needed

// Cloudflare R2
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const DATA_FILE = path.join(DATA_DIR, "qr.json");
const UP_DIR = path.join(ROOT, "uploads", "qr");

for (const p of [DATA_DIR, UP_DIR]) fs.mkdirSync(p, { recursive: true });

/* ------------------ R2 config ------------------ */
const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || "";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "";
const R2_BUCKET = process.env.R2_BUCKET || "lawprepx";
const R2_PUBLIC_BASE = (process.env.R2_PUBLIC_BASE || "").replace(/\/+$/, "");
const REQUIRE_R2 = String(process.env.QR_REQUIRE_R2 || "false").toLowerCase() === "true";

const r2Ready =
  !!R2_ACCOUNT_ID && !!R2_ACCESS_KEY_ID && !!R2_SECRET_ACCESS_KEY && !!R2_PUBLIC_BASE;

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
  },
});

// where we persist the JSON in R2
const R2_DB_KEY = "data/qr.json";

async function streamToString(body) {
  if (body && typeof body.transformToString === "function") return body.transformToString();
  return await new Promise((resolve, reject) => {
    const chunks = [];
    body.on("data", (c) => chunks.push(Buffer.from(c)));
    body.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    body.on("error", reject);
  });
}

function r2KeyFromPublicUrl(publicUrl) {
  try {
    const base = new URL(R2_PUBLIC_BASE);
    const u = new URL(publicUrl);
    if (u.host !== base.host) return "";
    let key = u.pathname;
    if (base.pathname !== "/" && key.startsWith(base.pathname)) key = key.slice(base.pathname.length);
    return key.replace(/^\/+/, "");
  } catch {
    return "";
  }
}

/* ------------------ Default config ------------------ */
const defaultConfig = {
  url: "",
  currency: "₹",
  upi: "",
  plans: {
    weekly: { label: "Weekly", price: 200 },
    monthly: { label: "Monthly", price: 400 },
    yearly: { label: "Yearly", price: 1000 },
  },
};

/* ------------------ JSON helpers (R2 + local) ------------------ */
async function readJSON() {
  if (r2Ready) {
    try {
      const obj = await s3.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: R2_DB_KEY }));
      const raw = await streamToString(obj.Body);
      const json = JSON.parse(raw || "{}");
      // hydrate local copy for convenience
      await fsp.writeFile(DATA_FILE, JSON.stringify(json, null, 2), "utf8");
      return json;
    } catch {
      // fall through to local
    }
  }
  try {
    const raw = await fsp.readFile(DATA_FILE, "utf8");
    return JSON.parse(raw || "{}");
  } catch {
    return { ...defaultConfig };
  }
}

async function writeJSON(data) {
  const str = JSON.stringify(data, null, 2);
  await fsp.writeFile(DATA_FILE, str, "utf8");
  if (r2Ready) {
    try {
      await s3.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: R2_DB_KEY,
          Body: str,
          ContentType: "application/json",
          CacheControl: "no-cache",
        })
      );
    } catch (e) {
      console.warn("QR: failed to persist qr.json to R2:", e?.message || e);
    }
  }
}

async function ensureConfig() {
  const cur = await readJSON();
  const merged = {
    ...defaultConfig,
    ...cur,
    upi: typeof cur.upi === "string" ? cur.upi : "",
    plans: {
      weekly: { ...defaultConfig.plans.weekly, ...(cur.plans?.weekly || {}) },
      monthly: { ...defaultConfig.plans.monthly, ...(cur.plans?.monthly || {}) },
      yearly: { ...defaultConfig.plans.yearly, ...(cur.plans?.yearly || {}) },
    },
  };
  if (JSON.stringify(cur) !== JSON.stringify(merged)) await writeJSON(merged);
  return merged;
}

async function unlinkQuiet(publicOrLocalUrl) {
  try {
    if (!publicOrLocalUrl) return;
    // R2?
    if (r2Ready && publicOrLocalUrl.startsWith(R2_PUBLIC_BASE + "/")) {
      const key = r2KeyFromPublicUrl(publicOrLocalUrl);
      if (key) await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
      return;
    }
    // Local?
    if (publicOrLocalUrl.startsWith("/uploads/qr/")) {
      const abs = path.join(ROOT, publicOrLocalUrl.replace(/^\//, ""));
      await fsp.unlink(abs).catch(() => {});
    }
  } catch {}
}

/* ------------------ Multer (accept images) ------------------ */
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UP_DIR),
  filename: (_req, file, cb) => cb(null, `${Date.now()}${path.extname(file.originalname || ".png")}`),
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /image\/(png|jpe?g|webp)/i.test(file.mimetype || "");
    cb(ok ? null : new Error("Only PNG/JPG/WEBP allowed"), ok);
  },
});

/* ------------------ Routes ------------------ */

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
    url: cfg.url,          // can be R2 public URL or local path
    currency: cfg.currency,
    upi: cfg.upi,
    plans: cfg.plans,
  });
});

// POST update (admin) — image + fields
router.post("/", isAdmin, upload.single("image"), async (req, res) => {
  const cfg = await ensureConfig();

  // update prices/labels/currency/upi first
  const {
    currency,
    weeklyLabel, weeklyPrice,
    monthlyLabel, monthlyPrice,
    yearlyLabel, yearlyPrice,
    upi, upiId, vpa,
  } = req.body || {};

  if (currency) cfg.currency = currency;
  const incomingUpi = (upi || upiId || vpa || "").toString().trim();
  if (incomingUpi) cfg.upi = incomingUpi;

  const num = (v, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
    };

  if (typeof weeklyLabel === "string") cfg.plans.weekly.label = weeklyLabel || cfg.plans.weekly.label;
  if (typeof monthlyLabel === "string") cfg.plans.monthly.label = monthlyLabel || cfg.plans.monthly.label;
  if (typeof yearlyLabel === "string") cfg.plans.yearly.label = yearlyLabel || cfg.plans.yearly.label;

  cfg.plans.weekly.price  = num(weeklyPrice,  cfg.plans.weekly.price);
  cfg.plans.monthly.price = num(monthlyPrice, cfg.plans.monthly.price);
  cfg.plans.yearly.price  = num(yearlyPrice,  cfg.plans.yearly.price);

  // handle image upload
  if (req.file) {
    // remove old image wherever it lives
    if (cfg.url) await unlinkQuiet(cfg.url);

    if (r2Ready) {
      // upload to R2
      const ext = path.extname(req.file.originalname || ".png") || ".png";
      const key = `qr/${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
      const buf = await fsp.readFile(req.file.path);

      await s3.send(
        new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: key,
          Body: buf,
          ContentType: req.file.mimetype || "image/png",
          CacheControl: "public, max-age=31536000, immutable",
          ContentDisposition: `inline; filename="qr${ext}"`,
        })
      );

      // set persistent public URL
      cfg.url = `${R2_PUBLIC_BASE}/${key}`;

      // clean the temporary local file to keep disk tidy
      fsp.unlink(req.file.path).catch(() => {});
    } else {
      if (REQUIRE_R2) {
        // if you want to force R2 presence
        fsp.unlink(req.file.path).catch(() => {});
        return res.status(503).json({ success: false, message: "Storage not configured" });
      }
      // keep local path as before
      cfg.url = `/uploads/qr/${req.file.filename}`;
    }
  }

  await writeJSON(cfg);
  res.json({ success: true, qr: cfg });
});

// DELETE image (admin)
router.delete("/image", isAdmin, async (_req, res) => {
  const cfg = await ensureConfig();
  if (cfg.url) await unlinkQuiet(cfg.url);
  cfg.url = "";
  await writeJSON(cfg);
  res.json({ success: true, qr: cfg });
});

/* ------------------ Error handler ------------------ */
router.use((err, _req, res, _next) => {
  console.error("QR route error:", err);
  res
    .status(err.status || 500)
    .json({ success: false, message: err.message || "Server error" });
});

export default router;
