require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 5000;
const ADMIN_KEY = process.env.ADMIN_KEY || "LAWNOWNER2025";
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/lawnetwork";

// ── Database ─────────────────────────────────────────────────────
mongoose
  .connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => {
    console.error("✗ MongoDB connection failed:", err.message);
    process.exit(1);
  });

// ── CORS Setup ──────────────────────────────────────────────────
app.use(
  cors({
    origin: "https://law-network-client.onrender.com",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Owner-Key", "x-owner-key"],
  })
);
app.options("*", cors());

// ── Global Middleware ──────────────────────────────────────────
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

app.use((req, _res, next) => {
  req.ADMIN_KEY = ADMIN_KEY;
  console.log(`[API] ${req.method} ${req.url}`);
  next();
});

// ── Ensure Upload Folders ──────────────────────────────────────
[
  "uploads",
  "uploads/consultancy",
  "uploads/banners",
  "uploads/articles",
  "uploads/video",
  "uploads/audio",
  "uploads/pdfs",
  "uploads/qr",
  "data",
].forEach((dir) => {
  const abs = path.join(__dirname, dir);
  if (!fs.existsSync(abs)) fs.mkdirSync(abs, { recursive: true });
});

// ── Health Check + Root ────────────────────────────────────────
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.get("/", (_req, res) => res.send("🚀 Law Network Backend is Live"));

// ── Start Server ───────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 API running on http://localhost:${PORT}`);
});
