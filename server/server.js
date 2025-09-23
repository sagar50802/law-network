import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import dotenv from "dotenv";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

// ── Resolve __dirname in ES module ───────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ── Load .env ───────────────────────────────────
dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI =
  process.env.MONGO_URI || "mongodb://localhost:27017/lawnetwork";

// ── Middlewares ─────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS allow client domain
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

// ── Ensure uploads folder exists ────────────────
const uploadDirs = [
  "uploads",
  "uploads/pdfs",
  "uploads/videos",
  "uploads/banners",
  "uploads/audio",
  "uploads/images",
];
uploadDirs.forEach((dir) => {
  const full = path.join(__dirname, dir);
  if (!fs.existsSync(full)) {
    fs.mkdirSync(full, { recursive: true });
  }
});
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ── Import Routes ──────────────────────────────
import articlesRoutes from "./routes/articles.js";
import bannersRoutes from "./routes/banners.js";
import consultancyRoutes from "./routes/consultancy.js";
import footerRoutes from "./routes/footer.js";
import newsRoutes from "./routes/news.js";
import pdfsRoutes from "./routes/pdfs.js";
import plagiarismRoutes from "./routes/plagiarism.js";
import playlistsRoutes from "./routes/playlists.js";
import podcastsRoutes from "./routes/podcasts.js";
import qrRoutes from "./routes/qr.js";
import scholarRoutes from "./routes/scholar.js";
import submissionsRoutes from "./routes/submissions.js";
import usersRoutes from "./routes/users.js";
import videosRoutes from "./routes/videos.js";
import gridfsRoutes from "./routes/gridfs.js";

// ── Use Routes ─────────────────────────────────
app.use("/api/articles", articlesRoutes);
app.use("/api/banners", bannersRoutes);
app.use("/api/consultancy", consultancyRoutes);
app.use("/api/footer", footerRoutes);
app.use("/api/news", newsRoutes);
app.use("/api/pdfs", pdfsRoutes);
app.use("/api/plagiarism", plagiarismRoutes);
app.use("/api/playlists", playlistsRoutes);
app.use("/api/podcasts", podcastsRoutes);
app.use("/api/qr", qrRoutes);
app.use("/api/scholar", scholarRoutes);
app.use("/api/submissions", submissionsRoutes);
app.use("/api/users", usersRoutes);
app.use("/api/videos", videosRoutes);
app.use("/api/gridfs", gridfsRoutes);

// ── Health check ───────────────────────────────
app.get("/api/health", (req, res) => {
  res.json({ ok: true, time: new Date().toISOString() });
});

// ── Connect DB & Start ─────────────────────────
mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB connected");
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ MongoDB connection failed:", err.message);
    process.exit(1);
  });
