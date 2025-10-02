// server/server.js
import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import mongoose from "mongoose";
import { fileURLToPath } from "url";

// ---------- app/bootstrap ----------
const app = express();
const PORT = process.env.PORT || 5000;

// __dirname in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------- CORS ----------
const CLIENT_URL =
  process.env.CLIENT_URL ||
  process.env.VITE_BACKEND_URL || // just in case you set this
  "https://law-network-client.onrender.com";

const ALLOWED_ORIGINS = [
  CLIENT_URL,
  "https://law-network.onrender.com",
  "http://localhost:5173",
  "http://localhost:3000",
];

const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true); // allow server-to-server / curl
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error("CORS not allowed: " + origin));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Owner-Key",
    "x-owner-key",
  ],
  optionsSuccessStatus: 204,
};

app.set("trust proxy", 1);
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json({ limit: "10mb" }));

// Always attach permissive headers for allowed origins (helps on some hosts)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin");
    res.header("Access-Control-Allow-Credentials", "true");
    res.header(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Owner-Key, x-owner-key"
    );
    res.header(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,PATCH,DELETE,OPTIONS"
    );
    res.header("Cross-Origin-Resource-Policy", "cross-origin");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Tiny log
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// Fix accidental /api/api/*
app.use((req, _res, next) => {
  if (req.url.startsWith("/api/api/")) {
    const before = req.url;
    req.url = req.url.replace(/^\/api\/api\//, "/api/");
    console.log("↪️  internally rewrote", before, "→", req.url);
  }
  next();
});

// ---------- Static uploads (make sure folders exist) ----------
[
  "uploads",
  "uploads/articles",
  "uploads/banners",
  "uploads/consultancy",
  "uploads/submissions",
  "uploads/videos",
  "uploads/podcasts",
  "uploads/qr",
].forEach((rel) => {
  const full = path.join(__dirname, rel);
  if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
});

app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"), {
    setHeaders: (res) => {
      res.setHeader("Access-Control-Allow-Origin", CLIENT_URL);
    },
  })
);

// ---------- Routes (ESM) ----------
import articleRoutes from "./routes/articles.js";
import bannerRoutes from "./routes/banners.js";
import consultancyRoutes from "./routes/consultancy.js";
import newsRoutes from "./routes/news.js";
import pdfRoutes from "./routes/pdfs.js"; // your pdfs route

// ⬇️ make sure this file exists at server/routes/podcast.js
import podcastRoutes from "./routes/podcast.js";
import videoRoutes from "./routes/videos.js"; // videos

import submissionsRoutes from "./routes/submissions.js"; // admin submissions + SSE
import qrRoutes from "./routes/qr.js"; // ✅ new QR route (converted to ESM)

// ---------- Mounts ----------
app.use("/api/articles", articleRoutes);
app.use("/api/banners", bannerRoutes);
app.use("/api/consultancy", consultancyRoutes);
app.use("/api/news", newsRoutes);
app.use("/api/pdfs", pdfRoutes);

// Podcasts
app.use("/api/podcasts", podcastRoutes);

// Videos
app.use("/api/videos", videoRoutes);

// Submissions (admin list, auto-mode, approve/revoke, SSE stream)
app.use("/api/submissions", submissionsRoutes);

// ✅ QR route
app.use("/api/qr", qrRoutes);

// Quiet the client probe
app.get("/api/access/status", (_req, res) => res.json({ access: false }));

// ---------- Probes ----------
app.get("/api/ping", (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.get("/api/_routes_check", (_req, res) =>
  res.json({
    ok: true,
    hasArticles: true,
    hasBanners: true,
    hasConsultancy: true,
    hasNews: true,
    hasPDFs: true,
    hasPodcasts: true,
    hasVideos: true,
    hasSubmissions: true,
    hasQR: true,
  })
);

// Root
app.get("/", (_req, res) => res.json({ ok: true, root: true }));

// 404
app.use((req, res) => {
  res
    .status(404)
    .json({ success: false, message: `Not Found: ${req.method} ${req.originalUrl}` });
});

// Error
app.use((err, _req, res, _next) => {
  console.error("Server error:", err);
  res
    .status(err.status || 500)
    .json({ success: false, message: err.message || "Server error" });
});

// ---------- Mongo ----------
const MONGO =
  process.env.MONGO_URI ||
  process.env.MONGO_URL ||
  process.env.MONGODB_URI ||
  "";

if (!MONGO) {
  console.error("✗ Missing MONGO connection string (MONGO_URI/MONGO_URL/MONGODB_URI)");
} else {
  mongoose
    .connect(MONGO, { dbName: process.env.MONGO_DB || undefined })
    .then(() => console.log("✅ MongoDB connected"))
    .catch((err) => console.error("✗ MongoDB connection failed:", err.message));
}

// ---------- Start ----------
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
