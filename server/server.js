// server/server.js
import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 5000;
const CLIENT_URL = process.env.CLIENT_URL || "https://law-network-client.onrender.com";

// ---- ESM __dirname ----
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---- Body / proxy ----
app.set("trust proxy", 1);
app.use(express.json({ limit: "10mb" }));

// ---- CORS (global) ----
const ALLOWED_ORIGINS = [
  CLIENT_URL,
  "https://law-network.onrender.com",
  "http://localhost:5173",
  "http://localhost:3000",
];

const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true); // curl / server-to-server
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

// Always attach CORS headers even on errors/404 (helps browsers)
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

// Tiny log (helps confirm the app is running)
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// ---- Ensure uploads folders ----
["uploads", "uploads/articles"].forEach((dir) => {
  const full = path.join(__dirname, dir);
  if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
});

// ---- Static /uploads ----
app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"), {
    setHeaders: (res) => res.setHeader("Access-Control-Allow-Origin", CLIENT_URL),
  })
);

// ---- Routes (ONLY articles enabled now) ----
import articleRoutes from "./routes/articles.js";
app.use("/api/articles", articleRoutes);
console.log("✅ Mounted: /api/articles");

// Debug probes
app.get("/api/ping", (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.get("/api/_routes_check", (_req, res) => res.json({ ok: true, hasArticles: true }));

// Root
app.get("/", (_req, res) => res.json({ ok: true, root: true }));

// ---- 404 ----
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Not Found: ${req.method} ${req.originalUrl}` });
});

// ---- Error handler ----
app.use((err, _req, res, _next) => {
  console.error("Server error:", err);
  res.status(err.status || 500).json({ success: false, message: err.message || "Server error" });
});

// ---- Start server FIRST so it serves JSON even if DB is down ----
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));

// ---- Connect Mongo (do not exit on failure) ----
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error("✗ Missing MONGO_URI env var (service will run but DB calls will fail)");
} else {
  mongoose
    .connect(MONGO_URI)
    .then(() => console.log("✅ MongoDB connected"))
    .catch((err) => console.error("✗ MongoDB connection failed:", err.message));
}
