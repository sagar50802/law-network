/* ----------------------------------------------------------------------------------
   ✅ Law Network — Clean & Stable Backend (server.js)
---------------------------------------------------------------------------------- */

import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import mongoose from "mongoose";
import { fileURLToPath } from "url";

/* -------------------------------------------------------------------------- */
/* 📌 Express Init                                                            */
/* -------------------------------------------------------------------------- */
const app = express();
const PORT = process.env.PORT || 5000;
const HOST = "0.0.0.0";

app.set("trust proxy", 1);

/* Resolve Dirname */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* -------------------------------------------------------------------------- */
/* 📌 Body Parser MUST COME BEFORE CORS                                       */
/* -------------------------------------------------------------------------- */
app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true, limit: "100mb" }));
app.use(express.text({ type: "*/*" }));

/* -------------------------------------------------------------------------- */
/* 📌 Simplified, Safe CORS                                                   */
/* -------------------------------------------------------------------------- */
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (origin.includes("onrender.com")) return callback(null, true);
    if (origin.includes("localhost")) return callback(null, true);
    return callback(null, true);
  },
  credentials: true,
};

app.use(cors(corsOptions));

/* -------------------------------------------------------------------------- */
/* 📌 Logger                                                                  */
/* -------------------------------------------------------------------------- */
app.use((req, _res, next) => {
  if (req.path !== "/favicon.ico") {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
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
  "uploads/library",
  "uploads/questionanswer", // ✅ Add QnA uploads folder
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
/* 📌 IMPORT ROUTES                                                           */
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
import libraryUserRouter from "./routes/libraryUser.js";
import librarySettingsAdmin from "./routes/librarySettingsAdmin.js";
import libraryAdminRouter from "./routes/libraryAdmin.js";

// ✅ IMPORT QnA ROUTES
import qnaRoutes from "./questionanswer/routes/qnaRoutes.js";

/* -------------------------------------------------------------------------- */
/* 📌 MOUNT ROUTES                                                            */
/* -------------------------------------------------------------------------- */

app.use("/api/library", libraryRouter);
app.use("/api/library", libraryUserRouter);

app.use("/api/admin", adminAuthRoutes);

app.use("/api/admin/library", libraryAdminRouter);
app.use("/api/admin/library", librarySettingsAdmin);

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
app.use("/api/footer", footerRoutes);
app.use("/api/terms", termsRoutes);

// ✅ MOUNT QnA ROUTES
app.use("/api/qna", qnaRoutes);

/* -------------------------------------------------------------------------- */
/* 📌 Health Check                                                            */
/* -------------------------------------------------------------------------- */
app.get("/api/ping", (_req, res) => res.json({ ok: true, ts: Date.now() }));
app.get("/", (_req, res) => res.json({ ok: true, service: "Law Network API" }));

/* -------------------------------------------------------------------------- */
/* 📌 404 Handler                                                             */
/* -------------------------------------------------------------------------- */
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Not Found: ${req.method} ${req.url}`,
  });
});

/* -------------------------------------------------------------------------- */
/* 📌 GLOBAL ERROR HANDLER                                                    */
/* -------------------------------------------------------------------------- */
app.use((err, req, res, next) => {
  console.error("🔥 GLOBAL ERROR:", err);
  res.status(500).json({
    success: false,
    message: err.message || "Internal Server Error",
  });
});

/* -------------------------------------------------------------------------- */
/* 📌 MongoDB Connect                                                         */
/* -------------------------------------------------------------------------- */
mongoose
  .connect(process.env.MONGO_URI, {
    dbName: process.env.MONGO_DB || undefined,
  })
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => console.error("❌ MongoDB Connection Error:", err.message));

/* -------------------------------------------------------------------------- */
/* 📌 Start Server                                                            */
/* -------------------------------------------------------------------------- */
const server = app.listen(PORT, HOST, () =>
  console.log(`🚀 API running on http://${HOST}:${PORT}`)
);

process.on("SIGTERM", () => server.close());
process.on("SIGINT", () => server.close());
