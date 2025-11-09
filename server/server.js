/* -------------------------------------------------------------------------- */
/* ✅ Law Network — Full Production Backend (server.js)                       */
/* -------------------------------------------------------------------------- */

import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import mongoose from "mongoose";
import { fileURLToPath } from "url";
import PrepModule from "./models/PrepModule.js";

/* -------------------------------------------------------------------------- */
/* ✅ Express Initialization                                                  */
/* -------------------------------------------------------------------------- */
const app = express();
const PORT = process.env.PORT || 5000;

/* ---------- Resolve __dirname (for ES modules) ---------- */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* -------------------------------------------------------------------------- */
/* ✅ CORS Configuration — Render Safe + Local Dev                            */
/* -------------------------------------------------------------------------- */
const CLIENT_URL =
  process.env.CLIENT_URL ||
  process.env.VITE_BACKEND_URL ||
  "https://law-network-client.onrender.com";

const ALLOWED = new Set([
  CLIENT_URL,
  "https://law-network-client.onrender.com",
  "https://law-network.onrender.com",
  "https://law-network-server.onrender.com",
  "http://localhost:5173",
  "http://localhost:3000",
]);

// Option A: global cors() early
app.use(
  cors({
    origin: [...ALLOWED],
    credentials: true,
  })
);

// Option B: dynamic CORS for unknown subdomains
const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (ALLOWED.has(origin)) return cb(null, true);
    try {
      const host = new URL(origin).hostname;
      if (/\.onrender\.com$/.test(host)) return cb(null, true);
    } catch {}
    return cb(new Error(`CORS not allowed for origin: ${origin}`));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS", "HEAD"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Owner-Key",
    "x-owner-key",
  ],
  exposedHeaders: ["Content-Type", "Content-Length"],
  optionsSuccessStatus: 204,
};

app.set("trust proxy", 1);
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

/* -------------------------------------------------------------------------- */
/* ✅ Fallback manual CORS headers                                            */
/* -------------------------------------------------------------------------- */
app.use((req, res, next) => {
  const origin = req.headers.origin;
  let ok = false;
  if (origin) {
    if (ALLOWED.has(origin)) ok = true;
    else {
      try {
        const host = new URL(origin).hostname;
        if (/\.onrender\.com$/.test(host)) ok = true;
      } catch {}
    }
  }
  if (ok) {
    res.header("Access-Control-Allow-Origin", origin);
    res.header("Vary", "Origin");
    res.header("Access-Control-Allow-Credentials", "true");
    res.header(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Owner-Key, x-owner-key"
    );
    res.header(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD"
    );
    res.header("Cross-Origin-Resource-Policy", "cross-origin");
  }
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

/* -------------------------------------------------------------------------- */
/* ✅ Middleware                                                              */
/* -------------------------------------------------------------------------- */
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true, limit: "100mb" }));

// Tiny request logger
app.use((req, _res, next) => {
  if (req.path !== "/favicon.ico")
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// Fix accidental /api/api/ rewrites
app.use((req, _res, next) => {
  if (req.url.startsWith("/api/api/")) {
    const old = req.url;
    req.url = req.url.replace(/^\/api\/api\//, "/api/");
    console.log("↪️ Rewrote", old, "→", req.url);
  }
  next();
});

/* -------------------------------------------------------------------------- */
/* ✅ Ensure Upload Directories Exist                                         */
/* -------------------------------------------------------------------------- */
[
  "uploads",
  "uploads/articles",
  "uploads/banners",
  "uploads/consultancy",
  "uploads/submissions",
  "uploads/videos",
  "uploads/podcasts",
  "uploads/qr",
  "uploads/testseries",
  "uploads/classroom",
].forEach((rel) => {
  const full = path.join(__dirname, rel);
  if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
});

/* -------------------------------------------------------------------------- */
/* ✅ Serve Static Uploads with Caching                                       */
/* -------------------------------------------------------------------------- */
const staticHeaders = {
  setHeaders(res, _p, stat) {
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    res.setHeader("Vary", "Origin");
    if (stat?.mtime) {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    } else {
      res.setHeader("Cache-Control", "public, max-age=86400");
    }
  },
};
app.use("/uploads", express.static(path.join(__dirname, "uploads"), staticHeaders));

/* -------------------------------------------------------------------------- */
/* ✅ Import and Mount Routes                                                 */
/* -------------------------------------------------------------------------- */
import articleRoutes from "./routes/articles.js";
import bannerRoutes from "./routes/banners.js";
import consultancyRoutes from "./routes/consultancy.js";
import newsRoutes from "./routes/news.js";
import pdfRoutes from "./routes/pdfs.js";
import podcastRoutes from "./routes/podcast.js";
import videoRoutes from "./routes/videos.js";
import submissionsRoutes from "./routes/submissions.js";
import qrRoutes from "./routes/qr.js";
import examRoutes from "./routes/exams.js";
import prepRoutes from "./routes/prep.js";
import prepAccessRoutes from "./routes/prep_access.js";
import filesRoutes from "./routes/files.js";
import testseriesRoutes from "./routes/testseries.js";
import plagiarismRoutes from "./routes/plagiarism.js";
import researchDraftingRoutes from "./routes/researchDrafting.js";
import livePublic from "./routes/livePublic.js";
import liveAdmin from "./routes/liveAdmin.js";
import classroomRoutes from "./routes/classroom.js";

/* ✅ NEW: Classroom Upload Media Route */
import classroomUploadRoutes from "./routes/classroomMediaUpload.js";


/* ---------- Mounting ---------- */
app.use("/api/articles", articleRoutes);
app.use("/api/banners", bannerRoutes);
app.use("/api/consultancy", consultancyRoutes);
app.use("/api/news", newsRoutes);
app.use("/api/pdfs", pdfRoutes);
app.use("/api/podcasts", podcastRoutes);
app.use("/api/videos", videoRoutes);
app.use("/api/submissions", submissionsRoutes);
app.use("/api/qr", qrRoutes);
app.use("/api/exams", examRoutes);
app.use("/", prepAccessRoutes);
app.use("/api/prep", prepRoutes);
app.use("/api/files", filesRoutes);
app.use("/api/testseries", testseriesRoutes);
app.use("/api/plagiarism", plagiarismRoutes);
app.use("/api/research-drafting", researchDraftingRoutes);
app.use("/api/live", livePublic);
app.use("/api/admin/live", liveAdmin);
app.use("/api/classroom", classroomRoutes);

/* ✅ Mount new media upload route */
app.use("/api/classroom/media", classroomUploadRoutes);

/* -------------------------------------------------------------------------- */
/* ✅ Health & Base Routes                                                    */
/* -------------------------------------------------------------------------- */
app.get("/favicon.ico", (_req, res) => res.sendStatus(204));
app.get("/api/ping", (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.get("/api/access/status", (_req, res) => res.json({ access: false }));
app.get("/", (_req, res) => res.json({ ok: true, root: true }));

/* -------------------------------------------------------------------------- */
/* ✅ 404 and Global Error Handling                                           */
/* -------------------------------------------------------------------------- */
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Not Found: ${req.method} ${req.originalUrl}`,
  });
});

app.use((err, _req, res, _next) => {
  if (err?.type === "entity.too.large") {
    return res
      .status(413)
      .json({ success: false, message: "Upload too large (max 100MB)" });
  }
  console.error("🔥 Server error:", err);
  res
    .status(err.status || 500)
    .json({ success: false, message: err.message || "Server Error" });
});

/* -------------------------------------------------------------------------- */
/* ✅ MongoDB Connection                                                     */
/* -------------------------------------------------------------------------- */
const MONGO_URI =
  process.env.MONGO_URI ||
  process.env.MONGO_URL ||
  process.env.MONGODB_URI ||
  "";

if (!MONGO_URI) {
  console.error("✗ Missing MongoDB connection string");
} else {
  mongoose
    .connect(MONGO_URI, { dbName: process.env.MONGO_DB || undefined })
    .then(() => console.log("✅ MongoDB connected successfully"))
    .catch((err) => console.error("✗ MongoDB connection failed:", err.message));
}

/* -------------------------------------------------------------------------- */
/* ✅ Auto Release Scheduler (Prep + Classroom)                              */
/* -------------------------------------------------------------------------- */
setInterval(async () => {
  try {
    const result = await PrepModule.updateMany(
      { status: "scheduled", releaseAt: { $lte: new Date() } },
      { $set: { status: "released" } }
    );
    if (result.modifiedCount > 0) {
      console.log(`[AutoRelease] ${result.modifiedCount} prep modules released.`);
    }
  } catch (err) {
    console.error("[AutoRelease Cron] Error:", err.message);
  }
}, 5 * 60 * 1000);

/* -------------------------------------------------------------------------- */
/* ✅ Auto Delete Old Classroom Media (10 days)                              */
/* -------------------------------------------------------------------------- */
import { s3, r2Enabled } from "./utils/r2.js";
import { ListObjectsV2Command, DeleteObjectsCommand } from "@aws-sdk/client-s3";

const BUCKET = process.env.R2_BUCKET;
const TEN_DAYS = 10 * 24 * 60 * 60 * 1000;

async function cleanOldFiles() {
  if (!r2Enabled()) return;
  try {
    const { Contents } = await s3.send(
      new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: "classroom/",
      })
    );

    const now = Date.now();
    const old = (Contents || []).filter(
      (f) => now - new Date(f.LastModified).getTime() > TEN_DAYS
    );
    if (!old.length) return;

    await s3.send(
      new DeleteObjectsCommand({
        Bucket: BUCKET,
        Delete: { Objects: old.map((f) => ({ Key: f.Key })) },
      })
    );

    console.log(`🧹 Deleted ${old.length} classroom files older than 10 days.`);
  } catch (err) {
    console.error("Cleanup error:", err);
  }
}

// Run cleanup every 24 hours
setInterval(cleanOldFiles, 24 * 60 * 60 * 1000);

/* -------------------------------------------------------------------------- */
/* ✅ Startup & Graceful Shutdown                                            */
/* -------------------------------------------------------------------------- */
const server = app.listen(PORT, () =>
  console.log(`🚀 Law Network API running on port ${PORT}`)
);

const shutdown = async (signal) => {
  console.log(`\n${signal} received. Graceful shutdown...`);
  server.close(() => console.log("🧩 HTTP server closed."));
  try {
    await mongoose.connection.close();
    console.log("✅ MongoDB connection closed.");
  } catch (err) {
    console.error("Error closing MongoDB:", err);
  } finally {
    process.exit(0);
  }
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("unhandledRejection", (err) => {
  console.error("Unhandled Promise Rejection:", err);
});

/* -------------------------------------------------------------------------- */
/* ✅ End of server.js                                                        */
/* -------------------------------------------------------------------------- */
