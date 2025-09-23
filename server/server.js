// server.js
require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const path = require("path");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 5000;
const ADMIN_KEY = process.env.ADMIN_KEY || "LAWNOWNER2025";
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/lawnetwork";

// trust proxy (Render/NGINX)
app.set("trust proxy", 1);

// ── CORS Setup ─────────────────────────────────────────────
const allowedOrigins = [
  "http://localhost:5173",                    // local dev
  "https://law-network-client.onrender.com",  // frontend
  "https://law-network.onrender.com",         // (old backend alias if used)
  "https://lawnetwork-api.onrender.com",      // ✅ actual backend API domain
];

// Primary CORS middleware
app.use(
  cors({
    origin(origin, cb) {
      if (!origin || allowedOrigins.includes(origin)) cb(null, origin || true);
      else cb(null, false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Owner-Key",
      "x-owner-key",
      "Origin",
      "Accept",
    ],
  })
);

// Always attach headers (including 404s/errors)
app.use((req, res, next) => {
  const origin = allowedOrigins.includes(req.headers.origin)
    ? req.headers.origin
    : allowedOrigins[0];
  res.header("Access-Control-Allow-Origin", origin);
  res.header("Vary", "Origin");
  res.header("Access-Control-Allow-Credentials", "true");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Owner-Key, x-owner-key"
  );
  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS"
  );
  res.header("Cross-Origin-Resource-Policy", "cross-origin");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

// Explicit OPTIONS (defensive)
app.options("*", (req, res) => {
  const origin = allowedOrigins.includes(req.headers.origin)
    ? req.headers.origin
    : allowedOrigins[0];
  res.header("Access-Control-Allow-Origin", origin);
  res.header("Vary", "Origin");
  res.header("Access-Control-Allow-Credentials", "true");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Owner-Key, x-owner-key"
  );
  res.header(
    "Access-Control-Allow-Methods",
    "GET, POST, PUT, PATCH, DELETE, OPTIONS"
  );
  res.header("Cross-Origin-Resource-Policy", "cross-origin");
  return res.sendStatus(204);
});

// ── Database ───────────────────────────────────────────────
mongoose
  .connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => {
    console.error("✗ MongoDB connection failed:", err.message);
    process.exit(1);
  });

// ── Global Middleware ─────────────────────────────────────
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true }));

// ✅ Serve static uploads with CORS headers
app.use(
  "/uploads",
  (req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", "*"); // static files safe
    res.setHeader("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
    next();
  },
  express.static(path.join(__dirname, "uploads"))
);

// Attach admin key + logger
app.use((req, _res, next) => {
  req.ADMIN_KEY = ADMIN_KEY;
  console.log(`[API] ${req.method} ${req.url}`);
  next();
});

// ── Ensure Upload Folders ─────────────────────────────────
[
  "uploads",
  "uploads/consultancy",
  "uploads/banners",
  "uploads/articles",
  "uploads/videos",
  "uploads/audio",       // ✅ keep singular everywhere
  "uploads/pdfs",
  "uploads/qr",
  "uploads/submissions",
  "data",
].forEach((dir) => {
  const abs = path.join(__dirname, dir);
  if (!fs.existsSync(abs)) fs.mkdirSync(abs, { recursive: true });
});

// ── MongoDB Access Model ──────────────────────────────────
const Access = mongoose.model(
  "Access",
  new mongoose.Schema({
    email: { type: String, required: true },
    feature: { type: String, required: true },
    featureId: { type: String, required: true },
    expiry: { type: Date },
    message: { type: String },
  })
);

// ── Access Routes ─────────────────────────────────────────
app.post("/api/access/grant", async (req, res) => {
  const { email, feature, featureId, expiry, message } = req.body || {};
  if (!email || !feature || !featureId)
    return res.status(400).json({ error: "Missing fields" });
  try {
    await Access.findOneAndUpdate(
      { email, feature, featureId },
      { expiry: expiry ? new Date(expiry) : null, message },
      { upsert: true, new: true }
    );
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/access/revoke", async (req, res) => {
  const { email, feature, featureId } = req.body || {};
  if (!email || !feature || !featureId)
    return res.status(400).json({ error: "Missing fields" });
  try {
    await Access.deleteOne({ email, feature, featureId });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/access/status", async (req, res) => {
  const { email, feature, featureId } = req.query || {};
  if (!email || !feature || !featureId) return res.json({ access: false });
  try {
    const record = await Access.findOne({ email, feature, featureId });
    if (!record) return res.json({ access: false });
    if (record.expiry && record.expiry < new Date()) {
      await Access.deleteOne({ _id: record._id });
      return res.json({ access: false });
    }
    res.json({ access: true, expiry: record.expiry, message: record.message });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Safe Dynamic Route Mounting ───────────────────────────
function mount(url, routePath) {
  const absPath = path.resolve(__dirname, routePath);
  if (!fs.existsSync(absPath)) {
    console.warn(`⚠️ Route file not found: ${routePath} → Skipping ${url}`);
    return;
  }
  try {
    const routeModule = require(absPath);
    app.use(url, routeModule);
    console.log(`✓ Mounted ${routePath} → ${url}`);
  } catch (err) {
    console.error(`✗ Failed to mount ${routePath} → ${url}\n→ ${err.message}`);
  }
}

// ✅ Route mounts
mount("/api/banners", "./routes/banners.js");
mount("/api/articles", "./routes/articles.js");
mount("/api/videos", "./routes/videos.js");
mount("/api/podcasts", "./routes/podcasts.js");
mount("/api/pdfs", "./routes/pdfs.js");
mount("/api/submissions", "./routes/submissions.js");
mount("/api/qr", "./routes/qr.js");
mount("/api/consultancy", "./routes/consultancy.js");
mount("/api/news", "./routes/news.js");
mount("/api/scholar", "./routes/scholar.js");
mount("/api/plagiarism", "./routes/plagiarism.js");
mount("/api/footer", "./routes/footer.js");

// 🔹 GridFS route for persistent PDFs (streaming)
mount("/api/gridfs", "./routes/gridfs.js");

// ── Health Check + Root ──────────────────────────────────
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.get("/", (_req, res) => res.send("🚀 Law Network Backend is Live"));

// ── Error handler (keeps CORS headers) ────────────────────
app.use((err, req, res, _next) => {
  const origin = allowedOrigins.includes(req.headers.origin)
    ? req.headers.origin
    : allowedOrigins[0];
  res.header("Access-Control-Allow-Origin", origin);
  res.header("Vary", "Origin");
  res.header("Access-Control-Allow-Credentials", "true");
  console.error("API error:", err);
  res.status(err.status || 500).json({ error: err.message || "Server error" });
});

// ── Start Server ─────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 API running on http://localhost:${PORT}`);
});
