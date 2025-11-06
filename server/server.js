/* -------------------------------------------------------------------------- */
/* ✅ Law Network — Backend Entry (server.js, full production version)        */
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
/* ✅ Express app initialization                                              */
/* -------------------------------------------------------------------------- */
const app = express();
const PORT = process.env.PORT || 5000;

/* ---------- Resolve __dirname (for ES modules) ---------- */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* -------------------------------------------------------------------------- */
/* ✅ CORS Setup (Render-safe, includes Option A recommended configuration)    */
/* -------------------------------------------------------------------------- */
const CLIENT_URL =
  process.env.CLIENT_URL ||
  process.env.VITE_BACKEND_URL ||
  "https://law-network-client.onrender.com";

/* Safe whitelist for all expected environments */
const ALLOWED = new Set([
  CLIENT_URL,
  "https://law-network-client.onrender.com",
  "https://law-network.onrender.com",
  "http://localhost:5173",
  "http://localhost:3000",
]);

/* Option A recommended quick CORS initialization (ensures headers early) */
app.use(
  cors({
    origin: [
      "https://law-network-client.onrender.com",
      "https://law-network.onrender.com",
      "http://localhost:5173",
      "http://localhost:3000",
    ],
    credentials: true,
  })
);

/* Robust custom CORS options for advanced control */
const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (ALLOWED.has(origin)) return cb(null, true);
    try {
      const host = new URL(origin).hostname;
      if (/\.onrender\.com$/.test(host)) return cb(null, true);
    } catch {}
    return cb(new Error("CORS not allowed: " + origin));
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

/* Always attach CORS headers manually for allowed origins (safety fallback) */
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
/* ✅ Body parsers (large limit for file uploads)                             */
/* -------------------------------------------------------------------------- */
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true, limit: "100mb" }));

/* -------------------------------------------------------------------------- */
/* ✅ Tiny logger for incoming requests                                       */
/* -------------------------------------------------------------------------- */
app.use((req, _res, next) => {
  if (req.path === "/favicon.ico") return next(); // avoid noisy logs
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

/* -------------------------------------------------------------------------- */
/* ✅ Fix accidental /api/api/* rewrites                                      */
/* -------------------------------------------------------------------------- */
app.use((req, _res, next) => {
  if (req.url.startsWith("/api/api/")) {
    const before = req.url;
    req.url = req.url.replace(/^\/api\/api\//, "/api/");
    console.log("↪️ internally rewrote", before, "→", req.url);
  }
  next();
});

/* -------------------------------------------------------------------------- */
/* ✅ Ensure upload folders exist                                             */
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
].forEach((rel) => {
  const full = path.join(__dirname, rel);
  if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
});

/* -------------------------------------------------------------------------- */
/* ✅ Static uploads serving (with cache headers)                             */
/* -------------------------------------------------------------------------- */
const UPLOADS_DIR_A = path.join(__dirname, "uploads");
const UPLOADS_DIR_B = path.join(process.cwd(), "server", "uploads");

const staticHeaders = {
  setHeaders(res, _p, stat) {
    res.setHeader("Access-Control-Allow-Origin", CLIENT_URL);
    res.setHeader("Vary", "Origin");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    if (stat && stat.mtime) {
      res.setHeader("Cache-Control", "public, max-age=31536000, immutable");
    } else {
      res.setHeader("Cache-Control", "public, max-age=86400");
    }
  },
};

app.use("/uploads", express.static(UPLOADS_DIR_A, staticHeaders));
app.use("/uploads", express.static(UPLOADS_DIR_B, staticHeaders));

/* -------------------------------------------------------------------------- */
/* ✅ Import all route modules                                                */
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

/* ---------- ✅ New Research Drafting Route ---------- */
import researchDraftingRoutes from "./routes/researchDrafting.js";

/* ---------- ✅ New Live Routes ---------- */
import livePublic from "./routes/livePublic.js";
import liveAdmin from "./routes/liveAdmin.js";

/* -------------------------------------------------------------------------- */
/* ✅ Mount routes                                                            */
/* -------------------------------------------------------------------------- */
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

/* ✅ FIXED MOUNTING ORDER
   prep_access.js defines full /api/prep/... paths, so mount at root.
*/
app.use("/", prepAccessRoutes);

/* ✅ prep.js defines relative endpoints, so mount under /api/prep */
app.use("/api/prep", prepRoutes);

app.use("/api/files", filesRoutes);
app.use("/api/testseries", testseriesRoutes);
app.use("/api/plagiarism", plagiarismRoutes);

/* ✅ Added Research Drafting API */
app.use("/api/research-drafting", researchDraftingRoutes);

/* ✅ Added Live Public/Admin APIs */
app.use("/api/live", livePublic);
app.use("/api/admin/live", liveAdmin);

/* -------------------------------------------------------------------------- */
/* ✅ Health, favicon & root endpoints                                        */
/* -------------------------------------------------------------------------- */
app.get("/favicon.ico", (_req, res) => res.sendStatus(204));
app.get("/api/access/status", (_req, res) => res.json({ access: false }));
app.get("/api/ping", (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.get("/", (_req, res) => res.json({ ok: true, root: true }));

/* -------------------------------------------------------------------------- */
/* ✅ 404 Handler                                                             */
/* -------------------------------------------------------------------------- */
app.use((req, res) =>
  res
    .status(404)
    .json({ success: false, message: `Not Found: ${req.method} ${req.originalUrl}` })
);

/* -------------------------------------------------------------------------- */
/* ✅ Global Error Handler (with upload safety)                               */
/* -------------------------------------------------------------------------- */
app.use((err, _req, res, _next) => {
  if (err?.type === "entity.too.large") {
    return res
      .status(413)
      .json({ success: false, message: "Upload too large (max 100MB total request)" });
  }
  console.error("Server error:", err);
  res
    .status(err.status || 500)
    .json({ success: false, message: err.message || "Server error" });
});

/* -------------------------------------------------------------------------- */
/* ✅ MongoDB Connection (robust)                                             */
/* -------------------------------------------------------------------------- */
const MONGO =
  process.env.MONGO_URI ||
  process.env.MONGO_URL ||
  process.env.MONGODB_URI ||
  "";

if (!MONGO) {
  console.error("✗ Missing MONGO connection string");
} else {
  mongoose
    .connect(MONGO, { dbName: process.env.MONGO_DB || undefined })
    .then(() => console.log("✅ MongoDB connected"))
    .catch((err) => console.error("✗ MongoDB connection failed:", err.message));
}

/* -------------------------------------------------------------------------- */
/* ✅ Auto Release Cron for Prep Modules                                      */
/* -------------------------------------------------------------------------- */
setInterval(async () => {
  try {
    const result = await PrepModule.updateMany(
      { status: "scheduled", releaseAt: { $lte: new Date() } },
      { $set: { status: "released" } }
    );
    if (result.modifiedCount > 0) {
      console.log(`[AutoRelease] ${result.modifiedCount} modules released automatically`);
    }
  } catch (err) {
    console.error("[AutoRelease Cron] Error:", err.message);
  }
}, 5 * 60 * 1000);

/* -------------------------------------------------------------------------- */
/* ✅ Startup Log                                                             */
/* -------------------------------------------------------------------------- */
console.log("✅ prep_access.js mounted at root ('/'). It serves /api/prep/* endpoints.");

/* -------------------------------------------------------------------------- */
/* ✅ Server Startup & Graceful Shutdown                                      */
/* -------------------------------------------------------------------------- */
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

const shutdown = async (signal) => {
  try {
    console.log(`\n${signal} received. Shutting down gracefully...`);
    server.close(() => {
      console.log("HTTP server closed.");
    });
    await mongoose.connection.close();
    console.log("MongoDB connection closed.");
  } catch (e) {
    console.error("Error during shutdown:", e);
  } finally {
    process.exit(0);
  }
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("unhandledRejection", (err) => {
  console.error("Unhandled Rejection:", err);
});

/* -------------------------------------------------------------------------- */
/* ✅ End of server.js                                                        */
/* -------------------------------------------------------------------------- */
