// server/routes/pdfs.js
const express = require("express");
const path = require("path");
const fs = require("fs");
const fsp = require("fs/promises");
const multer = require("multer");

const router = express.Router();

const ROOT = path.join(__dirname, "..");
const DATA_DIR = path.join(ROOT, "data");
const UP_DIR = path.join(ROOT, "uploads", "pdfs");
const DB_FILE = path.join(DATA_DIR, "pdfs.json");

for (const p of [DATA_DIR, UP_DIR]) fs.mkdirSync(p, { recursive: true });

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
const publicUrl = (abs) => `/${path.relative(ROOT, abs).replace(/\\/g, "/")}`;

/* ---------- multer ---------- */
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UP_DIR),
  filename: (_req, file, cb) => {
    const ext = (path.extname(file.originalname || "") || ".pdf").toLowerCase();
    cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  },
});
const upload = multer({ storage, limits: { fileSize: 100 * 1024 * 1024 } });
const uploadAny = upload.fields([{ name: "file" }, { name: "pdf" }, { name: "upload" }]);

function pickUploadedFile(req) {
  return (
    req.file ||
    req.files?.file?.[0] ||
    req.files?.pdf?.[0] ||
    req.files?.upload?.[0] ||
    (Array.isArray(req.files) && req.files[0]) ||
    null
  );
}

/* ---------- list ---------- */
router.get("/", async (_req, res) => {
  const db = await readDB();
  res.json({ success: true, subjects: db.subjects });
});

/* ---------- create subject ---------- */
router.post("/subjects", express.json(), async (req, res) => {
  const name = (req.body?.name || "").trim();
  if (!name) return res.status(400).json({ success: false, message: "Name required" });

  const db = await readDB();
  const id = name.toLowerCase().replace(/\s+/g, "-") || uid();
  if (db.subjects.find((s) => s.id === id)) {
    return res.status(409).json({ success: false, message: "Subject exists" });
  }

  const subject = { id, name, chapters: [] };
  db.subjects.push(subject);
  await writeDB(db);

  res.json({ success: true, subject });
});

/* ---------- add chapter ---------- */
router.post("/subjects/:sid/chapters", uploadAny, async (req, res) => {
  const db = await readDB();
  const sub = db.subjects.find((s) => s.id === req.params.sid);
  if (!sub) return res.status(404).json({ success: false, message: "Subject not found" });

  const title = String(req.body.title || "Untitled").slice(0, 200);
  const locked = req.body.locked === "true";

  let url = (req.body.url || "").trim();
  const up = pickUploadedFile(req);
  if (up) url = publicUrl(up.path);

  if (!url) return res.status(400).json({ success: false, message: "PDF required" });

  const ch = { id: uid(), title, url, locked, createdAt: new Date().toISOString() };
  sub.chapters.push(ch);
  await writeDB(db);

  res.json({ success: true, chapter: ch });
});

/* ---------- delete chapter ---------- */
router.delete("/subjects/:sid/chapters/:cid", async (req, res) => {
  const db = await readDB();
  const sub = db.subjects.find((s) => s.id === req.params.sid);
  if (!sub) return res.status(404).json({ success: false, message: "Subject not found" });

  const idx = sub.chapters.findIndex((c) => c.id === req.params.cid);
  if (idx < 0) return res.status(404).json({ success: false, message: "Chapter not found" });

  const removed = sub.chapters.splice(idx, 1)[0];
  if (removed.url?.startsWith("/uploads/pdfs/")) {
    const abs = path.join(ROOT, removed.url.replace(/^\//, ""));
    if (abs.startsWith(path.join(ROOT, "uploads", "pdfs"))) {
      await fsp.unlink(abs).catch(() => {});
    }
  }
  await writeDB(db);

  res.json({ success: true, removed });
});

/* ---------- delete subject ---------- */
router.delete("/subjects/:sid", async (req, res) => {
  const db = await readDB();
  const idx = db.subjects.findIndex((s) => s.id === req.params.sid);
  if (idx < 0) return res.status(404).json({ success: false, message: "Subject not found" });

  const sub = db.subjects[idx];
  for (const ch of sub.chapters || []) {
    if (ch.url?.startsWith("/uploads/pdfs/")) {
      const abs = path.join(ROOT, ch.url.replace(/^\//, ""));
      if (abs.startsWith(path.join(ROOT, "uploads", "pdfs"))) {
        await fsp.unlink(abs).catch(() => {});
      }
    }
  }
  db.subjects.splice(idx, 1);
  await writeDB(db);

  res.json({ success: true });
});

/* ---------- toggle lock ---------- */
router.patch("/subjects/:sid/chapters/:cid/lock", express.json(), async (req, res) => {
  const db = await readDB();
  const sub = db.subjects.find((s) => s.id === req.params.sid);
  const ch = sub?.chapters.find((c) => c.id === req.params.cid);
  if (!ch) return res.status(404).json({ success: false });

  ch.locked = !!req.body.locked;
  await writeDB(db);
  res.json({ success: true, chapter: ch });
});

module.exports = router;
