import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

// ── Config ───────────────────────────────
dotenv.config();
const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI =
  process.env.MONGO_URI || "mongodb://localhost:27017/lawnetwork";
const CLIENT_URL =
  process.env.CLIENT_URL || "https://law-network-client.onrender.com";

// ── Middlewares ──────────────────────────
app.use(express.json());

// ✅ CORS Setup
const ALLOWED_ORIGINS = [
  CLIENT_URL, // https://law-network-client.onrender.com
  "https://law-network.onrender.com", // ✅ added
  "http://localhost:5173",
  "http://localhost:3000",
];

const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // allow server-to-server
    if (ALLOWED_ORIGINS.includes(origin)) return callback(null, true);
    return callback(new Error("CORS not allowed for " + origin));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Owner-Key",
    "x-owner-key",
  ],
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions)); // ✅ handle preflight

// Always attach headers (extra safety)
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Access-Control-Allow-Credentials", "true");
    res.header(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,PATCH,DELETE,OPTIONS"
    );
    res.header(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Owner-Key, x-owner-key"
    );
  }
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// ── Ensure Uploads Folders ───────────────
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadDirs = [
  "uploads",
  "uploads/pdfs",
  "uploads/videos",
  "uploads/audio", // ✅ FIXED: singular (match podcasts.js)
  "uploads/banners",
  "uploads/articles",
  "uploads/qr",
];
uploadDirs.forEach((dir) => {
  const fullPath = path.join(__dirname, dir);
  if (!fs.existsSync(fullPath)) fs.mkdirSync(fullPath, { recursive: true });
});

// ── Static ───────────────────────────────
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ── Routes ───────────────────────────────
import articleRoutes from "./routes/articles.js";
import bannerRoutes from "./routes/banners.js";
import pdfRoutes from "./routes/pdfs.js";
import videoRoutes from "./routes/videos.js";
import podcastRoutes from "./routes/podcasts.js";
import consultancyRoutes from "./routes/consultancy.js";
import footerRoutes from "./routes/footer.js";
import newsRoutes from "./routes/news.js";
import qrRoutes from "./routes/qr.js";
import submissionRoutes from "./routes/submissions.js";

app.use("/api/articles", articleRoutes);
app.use("/api/banners", bannerRoutes);
app.use("/api/pdfs", pdfRoutes);
app.use("/api/videos", videoRoutes);
app.use("/api/podcasts", podcastRoutes);
app.use("/api/consultancy", consultancyRoutes);
app.use("/api/footer", footerRoutes);
app.use("/api/news", newsRoutes);
app.use("/api/qr", qrRoutes);
app.use("/api/submissions", submissionRoutes);

// ── DB Connect ───────────────────────────
mongoose
  .connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => {
    console.error("✗ MongoDB connection failed:", err.message);
    process.exit(1);
  });

// ── Health Check ─────────────────────────
app.get("/", (req, res) => {
  res.json({ ok: true, service: "LawNetwork API" });
});

// ── Start ────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
