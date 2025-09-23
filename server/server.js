// server/server.js
import dotenv from "dotenv";
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI =
  process.env.MONGO_URI || "mongodb://localhost:27017/lawnetwork";
const ADMIN_KEY = process.env.ADMIN_KEY || "LAWNOWNER2025";

// ── Middleware ─────────────────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ── CORS Setup ─────────────────────────────────────────────
app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "https://law-network-client.onrender.com",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Owner-Key",
      "x-owner-key",
    ],
  })
);

// Always attach headers (extra safety)
app.use((req, res, next) => {
  res.header(
    "Access-Control-Allow-Origin",
    req.headers.origin || "*"
  );
  res.header("Access-Control-Allow-Credentials", "true");
  res.header(
    "Access-Control-Allow-Methods",
    "GET,POST,PUT,PATCH,DELETE,OPTIONS"
  );
  res.header(
    "Access-Control-Allow-Headers",
    "Content-Type, Authorization, X-Owner-Key, x-owner-key"
  );
  if (req.method === "OPTIONS") {
    return res.sendStatus(200);
  }
  next();
});

// ── Ensure uploads directories exist ───────────────────────
const uploadDirs = [
  "uploads",
  "uploads/pdfs",
  "uploads/videos",
  "uploads/audios",
  "uploads/banners",
  "uploads/articles",
  "uploads/qrs",
];
uploadDirs.forEach((dir) => {
  const full = path.join(__dirname, dir);
  if (!fs.existsSync(full)) {
    fs.mkdirSync(full, { recursive: true });
  }
});

// ── Static serve uploads ───────────────────────────────────
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ── Routes ────────────────────────────────────────────────
// (Each of these files should export an express.Router)
import articleRoutes from "./routes/articleRoutes.js";
import bannerRoutes from "./routes/bannerRoutes.js";
import pdfRoutes from "./routes/pdfRoutes.js";
import videoRoutes from "./routes/videoRoutes.js";
import audioRoutes from "./routes/audioRoutes.js"; // podcasts
import submissionRoutes from "./routes/submissionRoutes.js";
import qrRoutes from "./routes/qrRoutes.js";

app.use("/api/articles", articleRoutes);
app.use("/api/banners", bannerRoutes);
app.use("/api/pdfs", pdfRoutes);
app.use("/api/videos", videoRoutes);
app.use("/api/podcasts", audioRoutes);
app.use("/api/submissions", submissionRoutes);
app.use("/api/qr", qrRoutes);

// ── DB Connect ────────────────────────────────────────────
mongoose
  .connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => {
    console.error("✗ MongoDB connection failed:", err.message);
    process.exit(1);
  });

// ── Health Check ──────────────────────────────────────────
app.get("/", (req, res) => {
  res.json({ ok: true, service: "LawNetwork API" });
});

// ── Start ─────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
