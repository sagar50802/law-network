import express from "express";
import multer from "multer";
import path from "path";
import ExamModule from "../models/ExamModule.js";
import ExamProgress from "../models/ExamProgress.js";
import { uploadToR2 } from "../utils/r2.js";
import { ocrFileToText } from "../utils/ocr.js";
import { isAdmin, ensureDir } from "./utils.js";

const router = express.Router();
const TMP_DIR = path.join(process.cwd(), "server", "tmp");
ensureDir(TMP_DIR);
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, TMP_DIR),
  filename: (_req, file, cb) =>
    cb(null, Date.now() + "-" + Math.random().toString(36).slice(2) + path.extname(file.originalname))
});
const upload = multer({ storage });

// Admin upload + schedule
router.post("/modules",
  isAdmin,
  upload.fields([{ name: "file" }, { name: "audio" }]),
  async (req, res) => {
    try {
      const {
        examName,
        title,
        releaseAt,
        showOriginal,
        durationMinutes,
        highlights,
        sourceType
      } = req.body;

      const localFile = req.files?.file?.[0]?.path;
      const localAudio = req.files?.audio?.[0]?.path;

      let r2Key = null;
      if (localFile) {
        r2Key = `exams/${examName}/${path.basename(localFile)}`;
        await uploadToR2(localFile, r2Key);
      }

      let audioR2Key = null;
      if (localAudio) {
        audioR2Key = `exams/${examName}/${path.basename(localAudio)}`;
        await uploadToR2(localAudio, audioR2Key);
      }

      let ocrText = "";
      if (localFile) ocrText = await ocrFileToText(localFile);

      const mod = await ExamModule.create({
        examName,
        title,
        sourceType,
        r2Key,
        audioR2Key,
        ocrText,
        releaseAt: new Date(releaseAt),
        showOriginal: showOriginal === "true" || showOriginal === true,
        durationMinutes: Number(durationMinutes) || 0,
        highlights: (highlights || "").split(",").map(s => s.trim()).filter(Boolean),
        createdBy: req.user?.email
      });

      res.json({ ok: true, module: mod });
    } catch (err) {
      console.error(err);
      res.status(500).json({ ok: false, error: err.message });
    }
  }
);

// Public: list released modules
router.get("/modules", async (req, res) => {
  const { examName } = req.query;
  const now = new Date();
  const modules = await ExamModule.find({ examName, releaseAt: { $lte: now } }).sort({ releaseAt: 1 });
  res.json({ ok: true, modules });
});

// Public: progress record
router.post("/progress", async (req, res) => {
  const { email, examName, moduleId, done } = req.body;
  let row = await ExamProgress.findOne({ email, moduleId });
  if (!row) row = new ExamProgress({ email, examName, moduleId });
  row.done = done;
  row.completedAt = done ? new Date() : null;
  await row.save();
  res.json({ ok: true, progress: row });
});

router.get("/progress", async (req, res) => {
  const { email, examName } = req.query;
  const rows = await ExamProgress.find({ email, examName, done: true });
  res.json({ ok: true, progress: rows.map(r => r.moduleId) });
});

export default router;
