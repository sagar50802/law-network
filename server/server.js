// server/server.js
import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import cors from "cors";

import articleRoutes from "./routes/articles.js";
import bannerRoutes from "./routes/banners.js";
import consultancyRoutes from "./routes/consultancy.js";
import { streamFile } from "./utils/gfs.js";

const app = express();
const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || "https://law-network-client.onrender.com";

// Body / proxy
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
    if (!origin) return cb(null, true);
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

// Always attach CORS (even on errors/404)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin");
    res.header("Access-Control-Allow-Credentials", "true");
    res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Owner-Key, x-owner-key");
    res.header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Tiny log
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// Routes
app.use("/api/articles", articleRoutes);
app.use("/api/banners", bannerRoutes);
app.use("/api/consultancy", consultancyRoutes);

// GridFS stream endpoint
app.get("/api/files/:bucket/:id", streamFile);

// Probes
app.get("/api/ping", (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.get("/api/_routes_check", (_req, res) =>
  res.json({ ok: true, hasArticles: true, hasBanners: true, hasConsultancy: true })
);

// Root
app.get("/", (_req, res) => res.json({ ok: true, root: true }));

// 404 / errors
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Not Found: ${req.method} ${req.originalUrl}` });
});
app.use((err, _req, res, _next) => {
  console.error("Server error:", err);
  res.status(err.status || 500).json({ success: false, message: err.message || "Server error" });
});

// Start
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

// Mongo connect (non-fatal if fails)
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("✗ Missing MONGO_URI env var (service will run but DB calls will fail)");
} else {
  mongoose
    .connect(MONGO_URI)
    .then(() => console.log("✅ MongoDB connected"))
    .catch((err) => console.error("✗ MongoDB connection failed:", err.message));
}
