require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const mongoose = require("mongoose");
const qrRoutes = require("./routes/qr");
const scholarRoutes = require("./routes/scholar");

const app = express();
const PORT = process.env.PORT || 5000;
const ADMIN_KEY = process.env.ADMIN_KEY || "LAWNOWNER2025";

// ── DB ──────────────────────────────────────────────────────────
const MONGO_URI = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/lawnowner";
mongoose
  .connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✓ MongoDB connected"))
  .catch((err) => {
    console.error("✗ MongoDB connection failed:", err.message);
    process.exit(1);
  });

// Access model (unchanged)
const Access = mongoose.model(
  "Access",
  new mongoose.Schema({
    email: { type: String, required: true },
    feature: { type: String, required: true }, // playlist, video, pdf, podcast, article
    featureId: { type: String, required: true },
    expiry: { type: Date },
    message: { type: String },
  })
);

// ── CORS ────────────────────────────────────────────────────────
const ALLOW = [/^http:\/\/localhost:\d+$/, /^http:\/\/127\.0\.0\.1:\d+$/];
app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin) return cb(null, true);
      cb(null, ALLOW.some((r) => r.test(origin)));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Owner-Key", "x-owner-key"],
  })
);
app.options(/.*/, cors());

// ── Parsers ─────────────────────────────────────────────────────
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Scholar routes (as you had)
app.use("/api/scholar", scholarRoutes);

// ── Ensure folders ──────────────────────────────────────────────
[
  "uploads",
  "uploads/consultancy",
  "uploads/banners",
  "uploads/articles",
  "uploads/video",
  "uploads/audio",
  "uploads/pdfs",
  "uploads/qr",
  "data",
].forEach((rel) => {
  const dir = path.join(__dirname, rel);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

// ── Static ──────────────────────────────────────────────────────
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// Make admin key available
app.use((req, _res, next) => {
  req.ADMIN_KEY = ADMIN_KEY;
  next();
});

// ✅ Tiny request logger (this is the only new middleware)
app.use((req, _res, next) => {
  console.log(`[API] ${req.method} ${req.url}`);
  next();
});

// ── Mount helper ────────────────────────────────────────────────
function mount(url, file) {
  try {
    app.use(url, require(file));
    console.log("✓ mounted", file, "→", url);
  } catch (e) {
    console.error("✗ failed mounting", file, "→", url, "\n  Reason:", e.message);
    process.exit(1);
  }
}

// ── Routes ─────────────────────────────────────────────────────
mount("/api/banners", "./routes/banners");
mount("/api/articles", "./routes/articles");
mount("/api/videos", "./routes/videos");
mount("/api/podcasts", "./routes/podcasts");
mount("/api/pdfs", "./routes/pdfs");
mount("/api/submissions", "./routes/submissions");
mount("/api/qr", "./routes/qr");
mount("/api/consultancy", "./routes/consultancy");
mount("/api/news", "./routes/news");

// ✅ NEW plagiarism analyzer
mount("/api/plagiarism", "./routes/plagiarism");

// Access helpers (unchanged)
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

app.get("/api/health", (_req, res) => res.json({ ok: true }));

app.listen(PORT, () => console.log(`🚀 API on http://localhost:${PORT}`));
