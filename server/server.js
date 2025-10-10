// server/server.js
import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import mongoose from "mongoose";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 5000;

/* ---------- Resolve __dirname (for ES modules) ---------- */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* ---------- CORS (robust) ---------- */
const CLIENT_URL =
  process.env.CLIENT_URL ||
  process.env.VITE_BACKEND_URL ||
  "https://law-network-client.onrender.com";

// allow both client + api + local dev; also optionally any *.onrender.com
const ALLOWED = new Set([
  CLIENT_URL,
  "https://law-network-client.onrender.com",
  "https://law-network.onrender.com",
  "http://localhost:5173",
  "http://localhost:3000",
]);

const corsOptions = {
  origin(origin, cb) {
    // same-origin/curl/server-to-server (no Origin header)
    if (!origin) return cb(null, true);
    if (ALLOWED.has(origin)) return cb(null, true);
    try {
      const host = new URL(origin).hostname;
      if (/\.onrender\.com$/.test(host)) return cb(null, true);
    } catch {}
    return cb(new Error("CORS not allowed: " + origin));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Owner-Key",
    "x-owner-key",
  ],
  exposedHeaders: ["Content-Type", "Content-Length"],
  optionsSuccessStatus: 204,
};

app.set("trust proxy", 1);
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

/* Always attach CORS headers for allowed origins */
app.use((req, res, next) => {
  const origin = req.headers.origin;
  let ok = false;
  if (origin) {
    if (ALLOWED.has(origin)) ok = true;
    else {
      try {
        const host = new URL(origin).hostname;
        if (/\.onrender\.com$/.test(host)) ok = true;
      } catch {}
    }
  }
  if (ok) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin");
    res.header("Access-Control-Allow-Credentials", "true");
    res.header(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Owner-Key, x-owner-key"
    );
    res.header(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD"
    );
    res.header("Cross-Origin-Resource-Policy", "cross-origin");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

/* ---------- Body parsers ---------- */
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

/* ---------- Tiny log ---------- */
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

/* ---------- Fix accidental /api/api/* ---------- */
app.use((req, _res, next) => {
  if (req.url.startsWith("/api/api/")) {
    const before = req.url;
    req.url = req.url.replace(/^\/api\/api\//, "/api/");
    console.log("↪️  internally rewrote", before, "→", req.url);
  }
  next();
});

/* ---------- Ensure upload folders exist ---------- */
[
  "uploads",
  "uploads/articles",
  "uploads/banners",
  "uploads/consultancy",
  "uploads/submissions",
  "uploads/videos",
  "uploads/podcasts",
  "uploads/qr",
  "uploads/testseries",
].forEach((rel) => {
  const full = path.join(__dirname, rel);
  if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
});

/* ---------- Static /uploads (two roots, robust) ---------- */
// A: server-relative
const UPLOADS_DIR_A = path.join(__dirname, "uploads");
// B: cwd/server/uploads (some hosts run with cwd at repo root)
const UPLOADS_DIR_B = path.join(process.cwd(), "server", "uploads");

// Strong caching + CORS/CORP for images (fixed to your client origin)
const staticHeaders = {
  setHeaders(res, _p, stat) {
    res.setHeader("Access-Control-Allow-Origin", CLIENT_URL);
    res.setHeader("Vary", "Origin");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    if (stat && stat.mtime) {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    } else {
      res.setHeader("Cache-Control", "public, max-age=86400");
    }
  },
};

app.use("/uploads", express.static(UPLOADS_DIR_A, staticHeaders));
app.use("/uploads", express.static(UPLOADS_DIR_B, staticHeaders));

/* ---------- Routes ---------- */
import articleRoutes from "./routes/articles.js";
import bannerRoutes from "./routes/banners.js";
import consultancyRoutes from "./routes/consultancy.js";
import newsRoutes from "./routes/news.js";
import pdfRoutes from "./routes/pdfs.js";
import podcastRoutes from "./routes/podcast.js";
import videoRoutes from "./routes/videos.js";
import submissionsRoutes from "./routes/submissions.js";
import qrRoutes from "./routes/qr.js";
import examRoutes from "./routes/exams.js";

/* ✅ NEW: Prep (Exam Wizard) APIs */
import prepRoutes from "./routes/prep.js";
/* ✅ NEW: Prep Access APIs (Grant/Revoke/Restart) */
import prepAccessRoutes from "./routes/prep_access.js";
/* ✅ NEW: Files (GridFS) API */
import filesRoutes from "./routes/files.js";
/* ✅ NEW: Test Series API */
import testseriesRoutes from "./routes/testseries.js";

app.use("/api/articles", articleRoutes);
app.use("/api/banners", bannerRoutes);
app.use("/api/consultancy", consultancyRoutes);
app.use("/api/news", newsRoutes);
app.use("/api/pdfs", pdfRoutes);
app.use("/api/podcasts", podcastRoutes);
app.use("/api/videos", videoRoutes);
app.use("/api/submissions", submissionsRoutes);
app.use("/api/qr", qrRoutes);
app.use("/api/exams", examRoutes);

/* ✅ Mount new prep routes */
app.use("/api/prep", prepRoutes);
/* ✅ Mount new prep access routes */
app.use("/api/prep", prepAccessRoutes);
/* ✅ Mount GridFS files routes */
app.use("/api/files", filesRoutes);
/* ✅ Mount Test Series routes */
app.use("/api/testseries", testseriesRoutes);

/* ---------- Health/probes ---------- */
app.get("/api/access/status", (_req, res) => res.json({ access: false }));
app.get("/api/ping", (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.get("/", (_req, res) => res.json({ ok: true, root: true }));

/* ---------- 404 ---------- */
app.use((req, res) =>
  res
    .status(404)
    .json({ success: false, message: `Not Found: ${req.method} ${req.originalUrl}` })
);

/* ---------- Error handler ---------- */
app.use((err, _req, res, _next) => {
  console.error("Server error:", err);
  res
    .status(err.status || 500)
    .json({ success: false, message: err.message || "Server error" });
});

/* ---------- Mongo ---------- */
const MONGO =
  process.env.MONGO_URI ||
  process.env.MONGO_URL ||
  process.env.MONGODB_URI ||
  "";

if (!MONGO) {
  console.error("✗ Missing MONGO connection string");
} else {
  mongoose
    .connect(MONGO, { dbName: process.env.MONGO_DB || undefined })
    .then(() => console.log("✅ MongoDB connected"))
    .catch((err) => console.error("✗ MongoDB connection failed:", err.message));
}

/* ---------- Start ---------- */
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
