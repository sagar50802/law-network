const express = require("express");
const fs = require("fs");
const fsp = require("fs/promises");
const path = require("path");
const multer = require("multer");
const sanitizeHtml = require("sanitize-html");
const { ensureDir, readJSON, writeJSON, isAdmin } = require("./utils");

const router = express.Router();

const DATA_FILE = path.join(__dirname, "..", "data", "articles.json");
const UP_DIR = path.join(__dirname, "..", "uploads", "articles");
ensureDir(UP_DIR);
if (!fs.existsSync(DATA_FILE)) writeJSON(DATA_FILE, []);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UP_DIR),
  filename: (_req, file, cb) =>
    cb(null, `${Date.now()}${path.extname(file.originalname || "")}`),
});
const upload = multer({ storage });

/* ---------- list ---------- */
router.get("/", (_req, res) => {
  const items = readJSON(DATA_FILE, []);
  res.json({
    success: true,
    articles: items.sort((a, b) => b.createdAt - a.createdAt),
  });
});

/* ---------- create ---------- */
router.post("/", isAdmin, upload.single("image"), (req, res) => {
  const items = readJSON(DATA_FILE, []);
  const title = (req.body.title || "").trim();
  const raw = String(req.body.content || "");
  const allow = String(req.body.allowHtml || "false") === "true";

  const content = allow
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

  const item = {
    id: String(Date.now()),
    title,
    content,
    allowHtml: allow,
    image,
    createdAt: Date.now(),
  };
  items.unshift(item);
  writeJSON(DATA_FILE, items);
  res.json({ success: true, article: item });
});

/* ---------- delete ---------- */
router.delete("/:id", isAdmin, async (req, res) => {
  const items = readJSON(DATA_FILE, []);
  const idx = items.findIndex(
    (a) => a.id === req.params.id || a._id === req.params.id
  );
  if (idx === -1)
    return res.status(404).json({ success: false, message: "Not found" });

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

module.exports = router;
