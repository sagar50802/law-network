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

// ── Database ───────────────────────────────────────────────
mongoose
  .connect(MONGO_URI)
  .then(() => console.log("✅ MongoDB connected"))
  .catch((err) => {
    console.error("✗ MongoDB connection failed:", err.message);
    process.exit(1);
  });

// ── CORS Setup ─────────────────────────────────────────────
const allowedOrigins = [
  "http://localhost:5173",                   // local dev
  "https://law-network-client.onrender.com", // frontend on Render
];

app.use(
  cors({
    origin: function (origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, true); // ✅ fallback: still allow instead of blocking
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Owner-Key", "x-owner-key"],
  })
);

// ✅ Always attach CORS headers (even for 404/500 responses)
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", req.headers.origin || "*");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Owner-Key, x-owner-key"
  );
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, PATCH, OPTIONS");
  next();
});

app.options("*", cors());

// ── Global Middleware ─────────────────────────────────────
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

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
  "uploads/audios",
  "uploads/pdfs",
  "uploads/qr",
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
  const { email, feature, featureId, expiry, message } = req.body;
  if (!email || !feature || !featureId) return res.status(400).json({ error: "Missing fields" });
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
  const { email, feature, featureId } = req.body;
  if (!email || !feature || !featureId) return res.status(400).json({ error: "Missing fields" });
  try {
    await Access.deleteOne({ email, feature, featureId });
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/access/status", async (req, res) => {
  const { email, feature, featureId } = req.query;
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

// ✅ Add All Route Mounts Here
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

// ── Health Check + Root ──────────────────────────────────
app.get("/api/health", (_req, res) => res.json({ ok: true }));
app.get("/", (_req, res) => res.send("🚀 Law Network Backend is Live"));

// ── Start Server ─────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🚀 API running on http://localhost:${PORT}`);
});
