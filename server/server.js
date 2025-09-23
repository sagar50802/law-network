import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

// ── Setup ─────────────────────────────
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/lawnetwork";
const ADMIN_KEY = process.env.ADMIN_KEY || "LAWNOWNER2025";

// ── Middleware ─────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS setup (allow frontend)
app.use(
  cors({
    origin: "https://law-network-client.onrender.com",
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Owner-Key", "x-owner-key"],
  })
);

// Ensure uploads folders exist
const uploadDirs = [
  "uploads",
  "uploads/pdfs",
  "uploads/banners",
  "uploads/videos",
  "uploads/audio",
  "uploads/images",
];
uploadDirs.forEach((dir) => {
  const fullPath = path.join(__dirname, dir);
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
  }
});

// Serve static files
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ── Route Imports (match actual file names) ─────────────────────────────
import articles from "./routes/articles.js";
import banners from "./routes/banners.js";
import consultancy from "./routes/consultancy.js";
import footer from "./routes/footer.js";
import gridfs from "./routes/gridfs.js";
import news from "./routes/news.js";
import pdfs from "./routes/pdfs.js";
import plagiarism from "./routes/plagiarism.js";
import playlists from "./routes/playlists.js";
import podcasts from "./routes/podcasts.js";
import qr from "./routes/qr.js";
import scholar from "./routes/scholar.js";
import submissions from "./routes/submissions.js";
import users from "./routes/users.js";
import videos from "./routes/videos.js";

// ── Use Routes ─────────────────────────────
app.use("/api/articles", articles);
app.use("/api/banners", banners);
app.use("/api/consultancy", consultancy);
app.use("/api/footer", footer);
app.use("/api/gridfs", gridfs);
app.use("/api/news", news);
app.use("/api/pdfs", pdfs);
app.use("/api/plagiarism", plagiarism);
app.use("/api/playlists", playlists);
app.use("/api/podcasts", podcasts);
app.use("/api/qr", qr);
app.use("/api/scholar", scholar);
app.use("/api/submissions", submissions);
app.use("/api/users", users);
app.use("/api/videos", videos);

// ── DB Connect ─────────────────────────────
mongoose
  .connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => {
    console.error("✗ MongoDB connection failed:", err.message);
    process.exit(1);
  });

// ── Health Check ─────────────────────────────
app.get("/", (req, res) => {
  res.json({ ok: true, service: "LawNetwork API" });
});

// ── Start ─────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
