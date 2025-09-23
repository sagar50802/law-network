// server.js
require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 5000;
const ADMIN_KEY = process.env.ADMIN_KEY || "LAWNOWNER2025";
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/lawnetwork";

app.set("trust proxy", 1);

// ── CORS Setup ─────────────────────────────
const allowedOrigins = [
  "http://localhost:5173",
  "https://law-network-client.onrender.com",
  "https://law-network.onrender.com",
];

app.use((req, res, next) => {
  const origin = allowedOrigins.includes(req.headers.origin)
    ? req.headers.origin
    : allowedOrigins[0]; // fallback to localhost

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

  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// ── DB ─────────────────────────────────────
mongoose
  .connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => {
    console.error("✗ MongoDB connection failed:", err.message);
    process.exit(1);
  });

app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true }));

// ── Static uploads ─────────────────────────
app.use(
  "/uploads",
  (req, res, next) => {
    const origin = allowedOrigins.includes(req.headers.origin)
      ? req.headers.origin
      : allowedOrigins[0];
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Origin, X-Requested-With, Content-Type, Accept"
    );
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  },
  express.static(path.join(__dirname, "uploads"))
);

// ── Ensure Folders ─────────────────────────
[
  "uploads",
  "uploads/consultancy",
  "uploads/banners",
  "uploads/articles",
  "uploads/videos",
  "uploads/audio",
  "uploads/pdfs",
  "uploads/qr",
  "uploads/submissions",
  "data",
].forEach((dir) => {
  const abs = path.join(__dirname, dir);
  if (!fs.existsSync(abs)) fs.mkdirSync(abs, { recursive: true });
});

// ── Helper to mount safely ─────────────────
function mount(url, file) {
  const abs = path.resolve(__dirname, file);
  if (!fs.existsSync(abs)) {
    console.warn(`⚠️ Skipping ${url}, file not found: ${file}`);
    return;
  }
  try {
    app.use(url, require(abs));
    console.log(`✓ Mounted ${url} → ${file}`);
  } catch (err) {
    console.error(`✗ Failed to mount ${url}:`, err.message);
  }
}

// ✅ IMPORTANT: mount without extra /api prefix
mount("/articles", "./routes/articles.js");
mount("/videos", "./routes/videos.js");
mount("/podcasts", "./routes/podcasts.js");
mount("/pdfs", "./routes/pdfs.js");
mount("/submissions", "./routes/submissions.js");
mount("/qr", "./routes/qr.js");
mount("/consultancy", "./routes/consultancy.js");
mount("/news", "./routes/news.js");
mount("/scholar", "./routes/scholar.js");
mount("/plagiarism", "./routes/plagiarism.js");
mount("/footer", "./routes/footer.js");
mount("/banners", "./routes/banners.js");
mount("/gridfs", "./routes/gridfs.js");

// ── Health Check ───────────────────────────
app.get("/health", (_req, res) => res.json({ ok: true }));
app.get("/", (_req, res) => res.send("🚀 Law Network Backend Live"));

// ── Error handler ──────────────────────────
app.use((err, req, res, _next) => {
  const origin = allowedOrigins.includes(req.headers.origin)
    ? req.headers.origin
    : allowedOrigins[0];
  res.header("Access-Control-Allow-Origin", origin);
  res.header("Vary", "Origin");
  res.header("Access-Control-Allow-Credentials", "true");

  console.error("API error:", err);
  res.status(err.status || 500).json({ error: err.message || "Server error" });
});

// ── Start ──────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 API running on http://localhost:${PORT}`);
});
