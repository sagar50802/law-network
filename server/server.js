// server/server.js
import "dotenv/config";
import express from "express";
import mongoose from "mongoose";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";

const app = express();
const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/lawnetwork";
const CLIENT_URL = process.env.CLIENT_URL || "https://law-network-client.onrender.com";

// -- trust proxy (Render) --
app.set("trust proxy", 1);

// -- JSON body --
app.use(express.json({ limit: "10mb" }));

// -- Allowed origins --
const ALLOWED_ORIGINS = [
  CLIENT_URL,
  "https://law-network.onrender.com",
  "http://localhost:5173",
  "http://localhost:3000",
];

// -- CORS middleware (global) --
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

// -- Always attach CORS headers even on 404/errors --
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
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// -- tiny request log (helps confirm which service answers) --
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// -- ensure uploads folders --
const __dirname = path.dirname(fileURLToPath(import.meta.url));
[
  "uploads",
  "uploads/pdfs",
  "uploads/videos",
  "uploads/audio",
  "uploads/banners",
  "uploads/articles",
  "uploads/qr",
  "uploads/news",
].forEach((dir) => {
  const full = path.join(__dirname, dir);
  if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
});

// -- static --
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// -- routes --
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

// -- health / debug --
app.get("/api/ping", (_req, res) => res.json({ ok: true, service: "LawNetwork API", ts: Date.now() }));
app.get("/", (_req, res) => res.json({ ok: true, root: true }));

// -- 404 (keeps CORS headers) --
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Not Found: ${req.method} ${req.originalUrl}` });
});

// -- error handler (keeps CORS headers) --
app.use((err, _req, res, _next) => {
  console.error("Server error:", err);
  res.status(err.status || 500).json({ success: false, message: err.message || "Server error" });
});

// -- DB & start --
mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB connected");
    app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
  })
  .catch((err) => {
    console.error("✗ MongoDB connection failed:", err.message);
    process.exit(1);
  });
