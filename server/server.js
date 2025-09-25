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

// Always attach CORS headers
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

// ---- (optional) keep local uploads dir for legacy; harmless with GridFS ----
["uploads", "uploads/articles", "uploads/banners", "uploads/consultancy"].forEach((dir) => {
  const full = path.join(__dirname, dir);
  if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
});

// ---- Static for legacy URLs (won't be used after GridFS, but safe to keep) ----
app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"), {
    setHeaders: (res) => res.setHeader("Access-Control-Allow-Origin", CLIENT_URL),
  })
);

/* ---------------- Files streaming from GridFS ---------------- */
function gridBucket() {
  const db = mongoose.connection?.db;
  if (!db) return null;
  return new mongoose.mongo.GridFSBucket(db, { bucketName: "uploads" });
}

// Stream any GridFS file by id; supports Range for audio/video
app.get("/api/files/:id", async (req, res) => {
  try {
    const id = new mongoose.Types.ObjectId(req.params.id);
    const db = mongoose.connection?.db;
    if (!db) return res.status(503).json({ success: false, message: "DB not ready" });

    const filesCol = db.collection("uploads.files");
    const file = await filesCol.findOne({ _id: id });
    if (!file) return res.status(404).json({ success: false, message: "File not found" });

    const mime = file?.metadata?.mime || "application/octet-stream";
    const size = file.length;
    const range = req.headers.range;

    const bucket = gridBucket();
    if (!range) {
      res.set({
        "Content-Type": mime,
        "Content-Length": size,
        "Content-Disposition": "inline",
        "Accept-Ranges": "bytes",
      });
      bucket.openDownloadStream(id).pipe(res);
      return;
    }

    // Range: bytes=start-end
    const [startStr, endStr] = range.replace(/bytes=/, "").split("-");
    const start = Number(startStr) || 0;
    const end = endStr ? Number(endStr) : size - 1;
    const chunkSize = end - start + 1;

    res.status(206).set({
      "Content-Range": `bytes ${start}-${end}/${size}`,
      "Accept-Ranges": "bytes",
      "Content-Length": chunkSize,
      "Content-Type": mime,
      "Content-Disposition": "inline",
    });

    bucket.openDownloadStream(id, { start, end: end + 1 }).pipe(res);
  } catch (e) {
    console.error("files route error:", e);
    res.status(400).json({ success: false, message: "Bad file id" });
  }
});

/* ---------------- Feature routes ---------------- */
import articleRoutes from "./routes/articles.js";
app.use("/api/articles", articleRoutes);
console.log("✅ Mounted: /api/articles");

import bannerRoutes from "./routes/banners.js";
app.use("/api/banners", bannerRoutes);
console.log("✅ Mounted: /api/banners");

import consultancyRoutes from "./routes/consultancy.js";
app.use("/api/consultancy", consultancyRoutes);
console.log("✅ Mounted: /api/consultancy");

// Debug probes
app.get("/api/ping", (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.get("/api/_routes_check", (_req, res) =>
  res.json({ ok: true, hasArticles: true, hasBanners: true, hasConsultancy: true })
);

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

// ---- Start server FIRST ----
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
