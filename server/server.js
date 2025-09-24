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
const MONGO_URI = process.env.MONGO_URI; // Must be set in Render
const CLIENT_URL =
  process.env.CLIENT_URL || "https://law-network-client.onrender.com";

// trust proxy
app.set("trust proxy", 1);
app.use(express.json({ limit: "10mb" }));

// allowed origins
const ALLOWED_ORIGINS = [
  CLIENT_URL,
  "https://law-network.onrender.com",
  "http://localhost:5173",
  "http://localhost:3000",
];

// CORS
const corsOptions = {
  origin(origin, cb) {
    if (!origin) return cb(null, true);
    if (ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
    return cb(new Error("CORS not allowed: " + origin));
  },
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Owner-Key",
    "x-owner-key",
  ],
};
app.use(cors(corsOptions));
app.options("*", cors(corsOptions));

// log requests
app.use((req, _res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// ensure uploads folders
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
["uploads", "uploads/articles"].forEach((dir) => {
  const full = path.join(__dirname, dir);
  if (!fs.existsSync(full)) fs.mkdirSync(full, { recursive: true });
});

// static
app.use(
  "/uploads",
  express.static(path.join(__dirname, "uploads"), {
    setHeaders: (res) =>
      res.setHeader("Access-Control-Allow-Origin", CLIENT_URL),
  })
);

// routes
import articleRoutes from "./routes/articles.js";
app.use("/api/articles", articleRoutes);

// health
app.get("/api/ping", (_req, res) =>
  res.json({ ok: true, service: "LawNetwork API", ts: Date.now() })
);
app.get("/", (_req, res) => res.json({ ok: true, root: true }));

// 404
app.use((req, res) => {
  res
    .status(404)
    .json({ success: false, message: `Not Found: ${req.method} ${req.originalUrl}` });
});

// error
app.use((err, _req, res, _next) => {
  console.error("Server error:", err);
  res
    .status(err.status || 500)
    .json({ success: false, message: err.message || "Server error" });
});

// start
if (!MONGO_URI) {
  console.error("✗ Missing MONGO_URI env var");
  process.exit(1);
}
mongoose
  .connect(MONGO_URI)
  .then(() => {
    console.log("✅ MongoDB connected");
    app.listen(PORT, () =>
      console.log(`🚀 Server running on port ${PORT}`)
    );
  })
  .catch((err) => {
    console.error("✗ MongoDB connection failed:", err.message);
    process.exit(1);
  });
