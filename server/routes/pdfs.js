// server/routes/pdfs.js
const express = require("express");
const multer = require("multer");
const { GridFsStorage } = require("multer-gridfs-storage");
const mongoose = require("mongoose");
const { ObjectId } = require("mongodb"); // ✅ added for safe _id
const fsp = require("fs/promises");
const path = require("path");

const router = express.Router();
const mongoURI = process.env.MONGO_URI;

// 🔹 Metadata still stored in JSON (subjects/chapters)
const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const DB_FILE = path.join(DATA_DIR, "pdfs.json");

// Ensure data dir exists
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

const uid = () =>
  Math.random().toString(36).slice(2) + Date.now().toString(36);

// ---------------- GridFS Storage ----------------
// ✅ Upgrade: always return valid object with _id, prevent null crash
const storage = new GridFsStorage({
  url: mongoURI,
  file: (req, file) => {
    if (!file.mimetype || !file.mimetype.includes("pdf")) {
      return Promise.reject(new Error("Only PDF files allowed"));
    }
    return {
      _id: new ObjectId(), // ensure GridFS always has a safe unique id
      filename: `${Date.now()}-${(file.originalname || "file.pdf").replace(
        /\s+/g,
        "_"
      )}`,
      bucketName: "pdfs",
    };
  },
});
const upload = multer({ storage });
const uploadAny = upload.single("pdf"); // FormData.append("pdf", ...)

// ---------------- List all subjects ----------------
router.get("/", async (_req, res) => {
  const db = await readDB();
  res.json({ success: true, subjects: db.subjects });
});

// ---------------- Create subject ----------------
router.post("/subjects", express.json(), async (req, res) => {
  const name = (req.body?.name || "").trim();
  if (!name)
    return res.status(400).json({ success: false, message: "Name required" });

  const db = await readDB();
  const id = name.toLowerCase().replace(/\s+/g, "-") || uid();
  if (db.subjects.find((s) => s.id === id)) {
    return res
      .status(409)
      .json({ success: false, message: "Subject already exists" });
  }

  const subject = { id, name, chapters: [] };
  db.subjects.push(subject);
  await writeDB(db);

  res.json({ success: true, subject });
});

// ---------------- Add chapter (upload PDF to GridFS) ----------------
router.post("/subjects/:sid/chapters", uploadAny, async (req, res) => {
  const db = await readDB();
  const sub = db.subjects.find((s) => s.id === req.params.sid);
  if (!sub)
    return res
      .status(404)
      .json({ success: false, message: "Subject not found" });

  if (!req.file) {
    return res
      .status(400)
      .json({ success: false, message: "PDF file required" });
  }

  const title = String(req.body.title || "Untitled").slice(0, 200);
  const locked = req.body.locked === "true";

  // 🔹 URL points to GridFS streaming endpoint
  const url = `/api/gridfs/pdf/${req.file.filename}`;

  const ch = {
    id: uid(),
    title,
    url,
    locked,
    createdAt: new Date().toISOString(),
  };
  sub.chapters.push(ch);
  await writeDB(db);

  res.json({ success: true, chapter: ch });
});

// ---------------- Delete chapter ----------------
router.delete("/subjects/:sid/chapters/:cid", async (req, res) => {
  const db = await readDB();
  const sub = db.subjects.find((s) => s.id === req.params.sid);
  if (!sub)
    return res
      .status(404)
      .json({ success: false, message: "Subject not found" });

  const idx = sub.chapters.findIndex((c) => c.id === req.params.cid);
  if (idx < 0)
    return res
      .status(404)
      .json({ success: false, message: "Chapter not found" });

  const removed = sub.chapters.splice(idx, 1)[0];

  // 🔹 Delete file from GridFS if present
  if (removed?.url?.includes("/api/gridfs/pdf/")) {
    const filename = removed.url.split("/").pop();
    try {
      const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
        bucketName: "pdfs",
      });
      const files = await mongoose.connection.db
        .collection("pdfs.files")
        .find({ filename })
        .toArray();
      if (files.length) {
        await bucket.delete(files[0]._id);
      }
    } catch (err) {
      console.error("⚠️ GridFS delete error:", err.message);
    }
  }

  await writeDB(db);
  res.json({ success: true, removed });
});

// ---------------- Delete subject ----------------
router.delete("/subjects/:sid", async (req, res) => {
  const db = await readDB();
  const idx = db.subjects.findIndex((s) => s.id === req.params.sid);
  if (idx < 0)
    return res
      .status(404)
      .json({ success: false, message: "Subject not found" });

  const sub = db.subjects[idx];

  // 🔹 Delete all related GridFS files
  try {
    const bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, {
      bucketName: "pdfs",
    });
    for (const ch of sub.chapters || []) {
      if (ch.url?.includes("/api/gridfs/pdf/")) {
        const filename = ch.url.split("/").pop();
        const files = await mongoose.connection.db
          .collection("pdfs.files")
          .find({ filename })
          .toArray();
        if (files.length) {
          await bucket.delete(files[0]._id);
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

// ---------------- Toggle lock ----------------
router.patch(
  "/subjects/:sid/chapters/:cid/lock",
  express.json(),
  async (req, res) => {
    const db = await readDB();
    const sub = db.subjects.find((s) => s.id === req.params.sid);
    const ch = sub?.chapters.find((c) => c.id === req.params.cid);
    if (!ch) return res.status(404).json({ success: false });

    ch.locked = !!req.body.locked;
    await writeDB(db);
    res.json({ success: true, chapter: ch });
  }
);

module.exports = router;
