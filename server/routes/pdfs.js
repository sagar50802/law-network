// server/routes/pdfs.js
const express = require("express");
const multer = require("multer");
const { GridFsStorage } = require("multer-gridfs-storage");
const mongoose = require("mongoose");
const { ObjectId } = require("mongodb");
const fsp = require("fs/promises");
const path = require("path");

const router = express.Router();
const mongoURI = process.env.MONGO_URI;

// ── Allowed origins (match server.js) ─────────────────────
const allowedOrigins = [
  "http://localhost:5173",
  "https://law-network-client.onrender.com",
  "https://law-network.onrender.com",
];

function setCors(res, originHeader) {
  const origin = allowedOrigins.includes(originHeader) ? originHeader : allowedOrigins[0];
  res.header("Access-Control-Allow-Origin", origin);
  res.header("Vary", "Origin");
  res.header("Access-Control-Allow-Credentials", "true");
  res.header(
    "Access-Control-Allow-Headers",
    "Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Owner-Key, x-owner-key"
  );
  res.header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.header("Cross-Origin-Resource-Policy", "cross-origin");
}

// Apply to all requests
router.use((req, res, next) => {
  setCors(res, req.headers.origin);
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});
router.options("*", (req, res) => {
  setCors(res, req.headers.origin);
  return res.sendStatus(204);
});

// ── JSON metadata (pdfs.json) ─────────────────────────────
const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const DB_FILE = path.join(DATA_DIR, "pdfs.json");
fsp.mkdir(DATA_DIR, { recursive: true }).catch(() => {});

async function readDB() {
  try {
    const raw = await fsp.readFile(DB_FILE, "utf8");
    const json = JSON.parse(raw || "{}");
    json.subjects ||= [];
    return json;
  } catch {
    return { subjects: [] };
  }
}
async function writeDB(db) {
  await fsp.writeFile(DB_FILE, JSON.stringify(db, null, 2), "utf8");
}
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

// ── GridFS storage ───────────────────────────────────────
const storage = new GridFsStorage({
  url: mongoURI,
  file: (_req, file) => {
    if (!file.mimetype || !file.mimetype.includes("pdf")) {
      return Promise.reject(new Error("Only PDF files allowed"));
    }
    return {
      _id: new ObjectId(),
      filename: `${Date.now()}-${(file.originalname || "file.pdf").replace(/\s+/g, "_")}`,
      bucketName: "pdfs",
    };
  },
});
storage.on("connection", () => console.log("✓ GridFS storage ready (pdfs)"));
storage.on("connectionFailed", (e) => console.error("✗ GridFS storage error:", e?.message));

const upload = multer({ storage });
function multerSafe(mw) {
  return (req, res, next) => {
    mw(req, res, (err) => {
      if (err) {
        setCors(res, req.headers.origin);
        console.error("⚠️ Multer upload error:", err);
        return res.status(400).json({ success: false, message: err.message || "Upload error" });
      }
      next();
    });
  };
}
const uploadChapter = multerSafe(upload.fields([
  { name: "pdf", maxCount: 1 },
  { name: "file", maxCount: 1 },
]));

// ── Routes ──────────────────────────────────────────────

// List all subjects
router.get("/", async (_req, res) => {
  const db = await readDB();
  res.json({ success: true, subjects: db.subjects });
});

// Create subject
router.post("/subjects", express.json(), async (req, res) => {
  const name = (req.body?.name || "").trim();
  if (!name) return res.status(400).json({ success: false, message: "Name required" });

  const db = await readDB();
  const id = name.toLowerCase().replace(/\s+/g, "-") || uid();
  if (db.subjects.find((s) => s.id === id)) {
    return res.status(409).json({ success: false, message: "Subject already exists" });
  }
  const subject = { id, name, chapters: [] };
  db.subjects.push(subject);
  await writeDB(db);
  res.json({ success: true, subject });
});

// Add chapter (upload PDF)
router.post("/subjects/:sid/chapters", uploadChapter, async (req, res) => {
  try {
    const db = await readDB();
    const sub = db.subjects.find((s) => s.id === req.params.sid);
    if (!sub) return res.status(404).json({ success: false, message: "Subject not found" });

    const file = (req.files?.pdf?.[0] || req.files?.file?.[0]) || null;
    if (!file) return res.status(400).json({ success: false, message: "PDF file required" });

    const title = String(req.body.title || "Untitled").slice(0, 200);
    const locked = req.body.locked === "true";

    const url = `/api/gridfs/pdf/${file.filename}`;
    const ch = { id: uid(), title, url, locked, createdAt: new Date().toISOString() };

    sub.chapters.push(ch);
    await writeDB(db);
    res.json({ success: true, chapter: ch });
  } catch (err) {
    console.error("⚠️ Chapter upload error:", err);
    res.status(500).json({ success: false, message: err.message || "Server error" });
  }
});

// Delete chapter
router.delete("/subjects/:sid/chapters/:cid", async (req, res) => {
  const db = await readDB();
  const sub = db.subjects.find((s) => s.id === req.params.sid);
  if (!sub) return res.status(404).json({ success: false, message: "Subject not found" });

  const idx = sub.chapters.findIndex((c) => c.id === req.params.cid);
  if (idx < 0) return res.status(404).json({ success: false, message: "Chapter not found" });

  const removed = sub.chapters.splice(idx, 1)[0];

  if (removed?.url?.includes("/api/gridfs/pdf/")) {
    const filename = removed.url.split("/").pop();
    try {
      if (mongoose.connection.readyState === 1) {
        const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "pdfs" });
        const files = await mongoose.connection.db.collection("pdfs.files").find({ filename }).toArray();
        if (files.length) await bucket.delete(files[0]._id);
      }
    } catch (err) {
      console.error("⚠️ GridFS delete error:", err.message);
    }
  }

  await writeDB(db);
  res.json({ success: true, removed });
});

// Delete subject (and its PDFs)
router.delete("/subjects/:sid", async (req, res) => {
  const db = await readDB();
  const idx = db.subjects.findIndex((s) => s.id === req.params.sid);
  if (idx < 0) return res.status(404).json({ success: false, message: "Subject not found" });

  const sub = db.subjects[idx];
  try {
    if (mongoose.connection.readyState === 1) {
      const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: "pdfs" });
      for (const ch of sub.chapters || []) {
        if (ch.url?.includes("/api/gridfs/pdf/")) {
          const filename = ch.url.split("/").pop();
          const files = await mongoose.connection.db.collection("pdfs.files").find({ filename }).toArray();
          if (files.length) await bucket.delete(files[0]._id);
        }
      }
    }
  } catch (err) {
    console.error("⚠️ GridFS subject delete error:", err.message);
  }
  db.subjects.splice(idx, 1);
  await writeDB(db);
  res.json({ success: true });
});

// Toggle lock/unlock
router.patch("/subjects/:sid/chapters/:cid/lock", express.json({ limit: "5mb" }), async (req, res) => {
  const db = await readDB();
  const sub = db.subjects.find((s) => s.id === req.params.sid);
  const ch = sub?.chapters.find((c) => c.id === req.params.cid);
  if (!ch) return res.status(404).json({ success: false, message: "Chapter not found" });

  ch.locked = !!req.body.locked;
  await writeDB(db);
  res.json({ success: true, chapter: ch });
});

// Error handler
router.use((err, req, res, _next) => {
  setCors(res, req.headers.origin);
  console.error("PDFs route error:", err);
  res.status(err.status || 500).json({ success: false, message: err.message || "Server error" });
});

module.exports = router;
