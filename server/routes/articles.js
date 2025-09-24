// server/routes/articles.js
const express = require("express");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const multer = require("multer");
const sanitizeHtml = require("sanitize-html");
const { ensureDir, readJSON, writeJSON, isAdmin } = require("./utils");

const router = express.Router();

/* ---------- paths & setup ---------- */
const DATA_FILE = path.join(__dirname, "..", "data", "articles.json");
const UP_DIR = path.join(__dirname, "..", "uploads", "articles");

ensureDir(UP_DIR);
if (!fs.existsSync(DATA_FILE)) writeJSON(DATA_FILE, []);

const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

/* ---------- multer ---------- */
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UP_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname || "").toLowerCase() || ".jpg";
    cb(null, `${Date.now()}-${uid()}${ext}`);
  },
});
const upload = multer({ storage });

/* ---------- list (public) ---------- */
router.get("/", (_req, res) => {
  const items = readJSON(DATA_FILE, []);
  res.json({
    success: true,
    articles: items.sort((a, b) => b.createdAt - a.createdAt),
  });
});

/* ---------- create (admin) ---------- */
router.post("/", isAdmin, upload.single("image"), (req, res) => {
  const items = readJSON(DATA_FILE, []);

  const title = (req.body.title || "").trim();
  const raw = String(req.body.content || "");
  const allowHtml = String(req.body.allowHtml || "false") === "true";

  const content = allowHtml
    ? sanitizeHtml(raw, {
        allowedTags: sanitizeHtml.defaults.allowedTags.concat([
          "img",
          "h1",
          "h2",
          "u",
          "iframe",
        ]),
        allowedAttributes: {
          ...sanitizeHtml.defaults.allowedAttributes,
          iframe: [
            "src",
            "width",
            "height",
            "allow",
            "allowfullscreen",
            "frameborder",
          ],
        },
      })
    : sanitizeHtml(raw, { allowedTags: [], allowedAttributes: {} });

  const image = req.file ? `/uploads/articles/${req.file.filename}` : "";

  // default locked=true unless explicitly false
  const locked =
    typeof req.body.locked === "string"
      ? req.body.locked.toLowerCase() !== "false"
      : req.body.locked === undefined
      ? true
      : !!req.body.locked;

  const item = {
    id: uid(),
    title,
    content,
    allowHtml,
    image,
    locked,
    createdAt: Date.now(),
  };

  items.unshift(item);
  writeJSON(DATA_FILE, items);

  res.json({ success: true, article: item });
});

/* ---------- delete (admin) ---------- */
router.delete("/:id", isAdmin, async (req, res) => {
  const items = readJSON(DATA_FILE, []);
  const idx = items.findIndex(
    (a) => a.id === req.params.id || a._id === req.params.id
  );
  if (idx === -1) {
    return res.status(404).json({ success: false, message: "Not found" });
  }

  const [removed] = items.splice(idx, 1);
  writeJSON(DATA_FILE, items);

  if (removed?.image?.startsWith("/uploads/articles/")) {
    const abs = path.join(__dirname, "..", removed.image.replace(/^\//, ""));
    const safeRoot = path.join(__dirname, "..", "uploads", "articles");
    if (abs.startsWith(safeRoot)) {
      await fsp.unlink(abs).catch(() => {});
    }
  }

  res.json({ success: true, removed });
});

/* ---------- lock/unlock (admin) ---------- */
router.patch("/:id/lock", isAdmin, express.json(), (req, res) => {
  const items = readJSON(DATA_FILE, []);
  const it = items.find((a) => a.id === req.params.id);
  if (!it) {
    return res.status(404).json({ success: false, message: "Not found" });
  }

  it.locked =
    typeof req.body.locked === "string"
      ? req.body.locked.toLowerCase() === "true"
      : !!req.body.locked;

  writeJSON(DATA_FILE, items);
  res.json({ success: true, article: it });
});

/* ---------- error handler ---------- */
router.use((err, _req, res, _next) => {
  console.error("Articles route error:", err);
  res
    .status(err.status || 500)
    .json({ success: false, message: err.message || "Server error" });
});

module.exports = router;
