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
const CLIENT_URL =
  process.env.CLIENT_URL || "https://law-network-client.onrender.com";

// __dirname
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// body / proxy
app.set("trust proxy", 1);
app.use(express.json({ limit: "10mb" }));

// CORS
const ALLOWED_ORIGINS = [
  CLIENT_URL,
  "https://law-network.onrender.com",
  "http://localhost:5173",
  "http://localhost:3000",
];
const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true); // server-to-server
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error("CORS not allowed: " + origin));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Owner-Key", "x-owner-key"],
  optionsSuccessStatus: 204,
};
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// Always attach CORS headers
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

// tiny log
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// --- fix accidental double /api (POST-safe via 308) ---
app.use((req, res, next) => {
  if (req.originalUrl.startsWith("/api/api/")) {
    const fixed = req.originalUrl.replace("/api/api/", "/api/");
    console.log("↪️  rewriting", req.originalUrl, "→", fixed);
    return res.redirect(308, fixed); // preserves method & body
  }
  next();
});

// keep legacy /uploads (safe)
["uploads", "uploads/articles", "uploads/banners", "uploads/consultancy"].forEach(
  (dir) => {
    const full = path.join(__dirname, dir);
    if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
  }
);
app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"), {
    setHeaders: (res) => res.setHeader("Access-Control-Allow-Origin", CLIENT_URL),
  })
);

// routes
import filesRoutes from "./routes/files.js";
import articleRoutes from "./routes/articles.js";
import bannerRoutes from "./routes/banners.js";
import consultancyRoutes from "./routes/consultancy.js";
import newsRoutes from "./routes/news.js";

// gridfs (CJS/ESM normalize)
const pdfGridfsModule = require("./routes/gridfs.js");
const pdfGridfsRoutes = pdfGridfsModule.default || pdfGridfsModule;

app.use("/api/files", filesRoutes);
app.use("/api/articles", articleRoutes);
app.use("/api/banners", bannerRoutes);
app.use("/api/consultancy", consultancyRoutes);
app.use("/api/news", newsRoutes);
app.use("/api/gridfs", pdfGridfsRoutes);

// quiet the client’s periodic probe
app.get("/api/access/status", (_req, res) => res.json({ access: false }));

console.log(
  "✅ Mounted: /api/files /api/articles /api/banners /api/consultancy /api/news /api/gridfs"
);

// probes
app.get("/api/ping", (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.get("/api/_routes_check", (_req, res) =>
  res.json({
    ok: true,
    hasFiles: true,
    hasArticles: true,
    hasBanners: true,
    hasConsultancy: true,
    hasNews: true,
    hasPDFs: true,
  })
);

// root
app.get("/", (_req, res) => res.json({ ok: true, root: true }));

// 404
app.use((req, res) => {
  res
    .status(404)
    .json({ success: false, message: `Not Found: ${req.method} ${req.originalUrl}` });
});

// error
app.use((err, _req, res, _next) => {
  console.error("Server error:", err);
  res
    .status(err.status || 500)
    .json({ success: false, message: err.message || "Server error" });
});

// start
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

// mongo
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("✗ Missing MONGO_URI env var (service will run but DB calls will fail)");
} else {
  mongoose
    .connect(MONGO_URI)
    .then(() => console.log("✅ MongoDB connected"))
    .catch((err) => console.error("✗ MongoDB connection failed:", err.message));
}
