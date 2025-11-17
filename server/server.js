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
/* 📌 Express Init                                                            */
/* -------------------------------------------------------------------------- */
const app = express();
const PORT = process.env.PORT || 5000;
const HOST = "0.0.0.0";

/* Resolve Dirname */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* -------------------------------------------------------------------------- */
/* 📌 Allowed Origins                                                         */
/* -------------------------------------------------------------------------- */
const CLIENT_URL =
  process.env.CLIENT_URL ||
  "https://law-network-client.onrender.com";

const ALLOWED = new Set([
  CLIENT_URL,
  "https://law-network-client.onrender.com",
  "https://law-network.onrender.com",
  "https://law-network-api.onrender.com",
  "http://localhost:5173",
  "http://localhost:3000",
]);

/* -------------------------------------------------------------------------- */
/* ✅ Correct Single CORS Handler                                              */
/* -------------------------------------------------------------------------- */
const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (ALLOWED.has(origin)) return cb(null, true);

    try {
      const host = new URL(origin).hostname;
      if (/\.onrender\.com$/.test(host)) return cb(null, true);
    } catch {}

    return cb(new Error("CORS blocked: " + origin));
  },
  credentials: true,
  methods: "GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD",
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Owner-Key",
    "x-admin-token",
    "x-owner-key",
  ],
  exposedHeaders: ["Content-Type", "Content-Length"],
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

/* -------------------------------------------------------------------------- */
/* 📌 Fallback Headers                                                        */
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
      "Content-Type, Authorization, X-Owner-Key, x-owner-key, x-admin-token"
    );
    res.header(
      "Access-Control-Allow-Methods",
      "GET,POST,PUT,PATCH,DELETE,OPTIONS,HEAD"
    );
  }

  if (req.method === "OPTIONS") return res.sendStatus(204);

  next();
});

/* -------------------------------------------------------------------------- */
/* 📌 Middleware                                                              */
/* -------------------------------------------------------------------------- */
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true, limit: "100mb" }));

app.use((req, _res, next) => {
  if (req.path !== "/favicon.ico")
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

app.use((req, _res, next) => {
  if (req.url.startsWith("/api/api/")) {
    req.url = req.url.replace(/^\/api\/api\//, "/api/");
  }
  next();
});

/* -------------------------------------------------------------------------- */
/* 📌 Ensure Upload Folders                                                   */
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
  // ✅ NEW: library uploads (PDF + covers)
  "uploads/library",
].forEach((rel) => {
  const full = path.join(__dirname, rel);
  if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
});

/* -------------------------------------------------------------------------- */
/* 📌 Serve Uploads                                                           */
/* -------------------------------------------------------------------------- */
app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"), {
    setHeaders(res) {
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      res.setHeader("Cache-Control", "public, max-age=31536000");
    },
  })
);

/* -------------------------------------------------------------------------- */
/* 📌 Import Routes                                                           */
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
import classroomAccessRoutes from "./routes/classroomAccess.js";
import classroomUploadRoutes from "./routes/classroomMediaUpload.js";
import adminAuthRoutes from "./routes/adminAuth.js";
import footerRoutes from "./routes/footer.js";
import termsRoutes from "./routes/terms.js";
import libraryRouter from "./routes/library.js";
import librarySettingsAdmin from "./routes/librarySettingsAdmin.js";
import libraryUserRouter from "./routes/libraryUser.js";
import libraryAdminRouter from "./routes/libraryAdmin.js";

/* -------------------------------------------------------------------------- */
/* 📌 Mount Routes                                                            */
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
app.use("/", prepAccessRoutes);
app.use("/api/prep", prepRoutes);
app.use("/api/files", filesRoutes);
app.use("/api/testseries", testseriesRoutes);
app.use("/api/plagiarism", plagiarismRoutes);
app.use("/api/research-drafting", researchDraftingRoutes);
app.use("/api/live", livePublic);
app.use("/api/admin/live", liveAdmin);
app.use("/api/classroom", classroomRoutes);
app.use("/api/classroom-access", classroomAccessRoutes);
app.use("/api/classroom/media", classroomUploadRoutes);
app.use("/api/admin", adminAuthRoutes);
app.use("/api/footer", footerRoutes);
app.use("/api/terms", termsRoutes);
app.use("/api/library", libraryRouter);
app.use("/api/admin/library", librarySettingsAdmin);
// USER routes
app.use("/api/library", libraryUserRouter);
// ADMIN routes
app.use("/api/admin/library", libraryAdminRouter);

/* -------------------------------------------------------------------------- */
/* 📌 Health Routes                                                           */
/* -------------------------------------------------------------------------- */
app.get("/api/ping", (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.get("/", (_req, res) => res.json({ ok: true, service: "Law Network API" }));

/* -------------------------------------------------------------------------- */
/* 📌 Global Errors                                                           */
/* -------------------------------------------------------------------------- */
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Not Found: ${req.method} ${req.url}` });
});

app.use((err, _req, res, _next) => {
  console.error("🔥 Error:", err);
  res.status(500).json({ success: false, message: err.message || "Server Error" });
});

/* -------------------------------------------------------------------------- */
/* 📌 MongoDB                                                                 */
/* -------------------------------------------------------------------------- */
mongoose
  .connect(process.env.MONGO_URI, { dbName: process.env.MONGO_DB || undefined })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("MongoDB error:", err.message));

/* -------------------------------------------------------------------------- */
/* 📌 Startup                                                                 */
/* -------------------------------------------------------------------------- */
const server = app.listen(PORT, HOST, () =>
  console.log(`🚀 API running on http://${HOST}:${PORT}`)
);

process.on("SIGTERM", () => server.close());
process.on("SIGINT", () => server.close());

