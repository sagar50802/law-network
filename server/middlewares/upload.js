const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Root uploads dir
const UPLOAD_ROOT = path.join(process.cwd(), "public", "uploads");

// Ensure subfolder exists
function ensureDir(dir) {
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (_) {}
}

// Convert filename → safe unique
function makeFilename(originalName) {
  const ts = Date.now();
  const base = path.basename(originalName).replace(/\s+/g, "_");
  return `${ts}-${base}`;
}

// Dynamic storage (based on subdir)
function storageFactory(subdir) {
  const target = path.join(UPLOAD_ROOT, subdir);
  ensureDir(target);

  return multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, target),
    filename: (_req, file, cb) => cb(null, makeFilename(file.originalname)),
  });
}

// Common file filters
const allowedImages = new Set([
  "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml"
]);
const allowedVideos = new Set([
  "video/mp4", "video/webm", "video/ogg", "video/quicktime", "video/x-msvideo", "video/x-matroska"
]);
const allowedAudio = new Set([
  "audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg", "audio/aac"
]);

function filterFactory(type) {
  return (_req, file, cb) => {
    const { mimetype } = file;
    if (type === "image" && allowedImages.has(mimetype)) return cb(null, true);
    if (type === "video" && (mimetype.startsWith("video/") || allowedVideos.has(mimetype))) return cb(null, true);
    if (type === "audio" && (mimetype.startsWith("audio/") || allowedAudio.has(mimetype))) return cb(null, true);
    cb(new Error(`Unsupported ${type} type`));
  };
}

// Export ready-to-use uploaders
module.exports = {
  image: multer({
    storage: storageFactory("images"),
    fileFilter: filterFactory("image"),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
  }),

  video: multer({
    storage: storageFactory("videos"),
    fileFilter: filterFactory("video"),
    limits: { fileSize: 1024 * 1024 * 1024 }, // 1GB
  }),

  audio: multer({
    storage: storageFactory("audio"),
    fileFilter: filterFactory("audio"),
    limits: { fileSize: 100 * 1024 * 1024 }, // 100MB
  }),

  pdf: multer({
    storage: storageFactory("pdfs"),
    fileFilter: (_req, file, cb) => {
      if (file.mimetype === "application/pdf") return cb(null, true);
      cb(new Error("Unsupported file type"));
    },
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  }),
};
