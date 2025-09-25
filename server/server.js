// server/server.js
import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createRequire } from "module";

const require = createRequire(import.meta.url);
const app = express();

const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || "https://law-network-client.onrender.com";

// __dirname for ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

// Body / proxy
app.set("trust proxy", 1);
app.use(express.json({ limit: "10mb" }));

/* ---------- CORS (global) ---------- */
const ALLOWED_ORIGINS = [
  CLIENT_URL,
  "https://law-network.onrender.com",
  "http://localhost:5173",
  "http://localhost:3000",
];

const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true);               // server-to-server
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error("CORS not allowed: " + origin));
  },
  credentials: true,
  methods: ["GET","POST","PUT","PATCH","DELETE","OPTIONS"],
  allowedHeaders: ["Content-Type","Authorization","X-Owner-Key","x-owner-key"],
  optionsSuccessStatus: 204,
};
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// Always attach CORS headers (even on 404/errors)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin");
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Owner-Key, x-owner-key");
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
    res.header("Cross-Origin-Resource-Policy", "cross-origin");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Tiny log
app.use((req, _res, next) => { console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`); next(); });

/* ---------- Keep legacy /uploads public (safe) ---------- */
["uploads", "uploads/articles", "uploads/banners", "uploads/consultancy"].forEach(dir => {
  const full = path.join(__dirname, dir);
  if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
});

app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"), {
    setHeaders: (res) => res.setHeader("Access-Control-Allow-Origin", CLIENT_URL),
  })
);

/* ---------- Routes ---------- */
import filesRoutes from "./routes/files.js";            // GridFS streamer (new)
import articleRoutes from "./routes/articles.js";      // ESM
import bannerRoutes from "./routes/banners.js";        // ESM
import consultancyRoutes from "./routes/consultancy.js"; // ESM
import newsRoutes from "./routes/news.js";             // ESM

// Your existing PDF GridFS route is CommonJS; load with require to avoid ESM errors
let pdfGridfsRoutes = null;
try {
  pdfGridfsRoutes = require("./routes/gridfs.js");
  app.use("/api/gridfs", pdfGridfsRoutes);
  console.log("✅ Mounted: /api/gridfs (PDFs)");
} catch (e) {
  console.warn("⚠️ Could not mount /api/gridfs (PDFs):", e.message);
}

app.use("/api/files", filesRoutes);
console.log("✅ Mounted: /api/files");

app.use("/api/articles", articleRoutes);
console.log("✅ Mounted: /api/articles");

app.use("/api/banners", bannerRoutes);
console.log("✅ Mounted: /api/banners");

app.use("/api/consultancy", consultancyRoutes);
console.log("✅ Mounted: /api/consultancy");

app.use("/api/news", newsRoutes);
console.log("✅ Mounted: /api/news");

// Stub so client’s access.js stops 404 logging
app.get("/api/access/status", (_req, res) => res.json({ access: false }));

// Debug probes
app.get("/api/ping", (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.get("/api/_routes_check", (_req, res) =>
  res.json({ ok: true, hasFiles: true, hasArticles: true, hasBanners: true, hasConsultancy: true, hasNews: true, hasPDFs: !!pdfGridfsRoutes })
);

// Root
app.get("/", (_req, res) => res.json({ ok: true, root: true }));

// 404
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Not Found: ${req.method} ${req.originalUrl}` });
});

// Error handler
app.use((err, _req, res, _next) => {
  console.error("Server error:", err);
  res.status(err.status || 500).json({ success: false, message: err.message || "Server error" });
});

// Start server first (so JSON is served even if DB is cold)
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

/* ---------- Mongo connect ---------- */
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("✗ Missing MONGO_URI env var");
} else {
  mongoose
    .connect(MONGO_URI)
    .then(() => console.log("✅ MongoDB connected"))
    .catch((err) => console.error("✗ MongoDB connection failed:", err.message));
}
