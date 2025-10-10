import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import mongoose from "mongoose";
import { isAdmin } from "./utils.js"; // already exists in your repo

const router = express.Router();

/* ---------- Upload dir ---------- */
const UP_DIR = path.join(process.cwd(), "server", "uploads", "testseries");
if (!fs.existsSync(UP_DIR)) fs.mkdirSync(UP_DIR, { recursive: true });

/* ---------- Multer setup ---------- */
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UP_DIR),
  filename: (req, file, cb) => {
    const safe = file.originalname
      .replace(/\s+/g, "_")
      .replace(/[^\w.\-]/g, "");
    cb(null, Date.now() + "_" + safe);
  },
});
const upload = multer({ storage });

/* ---------- Mongoose schema ---------- */
const TestSchema = new mongoose.Schema(
  {
    code: { type: String, unique: true, required: true },
    paper: { type: String, required: true }, // e.g. "Paper 1"
    title: { type: String, required: true },
    durationMin: { type: Number, default: 120 },
    totalQuestions: { type: Number, default: 150 },
    questions: [
      {
        qno: Number,
        text: String,
        options: [String],
        correct: String,
        marks: { type: Number, default: 1 },
        negative: { type: Number, default: 0.33 },
      },
    ],
  },
  { timestamps: true }
);

const ResultSchema = new mongoose.Schema(
  {
    testCode: String,
    user: {
      email: String,
      name: String,
    },
    answers: Object, // { qno: "A" }
    score: Number,
    timeTakenSec: Number,
  },
  { timestamps: true }
);

const Test = mongoose.models.TestSeries || mongoose.model("TestSeries", TestSchema);
const Result =
  mongoose.models.TestResult || mongoose.model("TestResult", ResultSchema);

/* =========================================================
   🚀 PUBLIC ROUTES (Viewer)
   ========================================================= */

/** GET /api/testseries
 *  → List all papers & their tests (for dashboard)
 */
router.get("/", async (req, res) => {
  try {
    const all = await Test.find({}, "paper title code totalQuestions durationMin").sort({
      paper: 1,
      createdAt: -1,
    });
    // Group by paper
    const grouped = {};
    all.forEach((t) => {
      if (!grouped[t.paper]) grouped[t.paper] = [];
      grouped[t.paper].push(t);
    });
    res.json({ success: true, papers: grouped });
  } catch (err) {
    console.error("GET /testseries error", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/** GET /api/testseries/:code
 *  → Fetch one test intro details (for TestIntro)
 */
router.get("/:code", async (req, res) => {
  try {
    const t = await Test.findOne({ code: req.params.code });
    if (!t) return res.status(404).json({ success: false, message: "Test not found" });
    const { title, durationMin, totalQuestions, paper } = t;
    res.json({ success: true, test: { title, durationMin, totalQuestions, paper } });
  } catch (err) {
    console.error("GET /testseries/:code", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/** GET /api/testseries/:code/play
 *  → Fetch full questions (for TestPlayer)
 */
router.get("/:code/play", async (req, res) => {
  try {
    const t = await Test.findOne({ code: req.params.code });
    if (!t) return res.status(404).json({ success: false, message: "Test not found" });
    res.json({ success: true, questions: t.questions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/** POST /api/testseries/:code/submit
 *  → Submit answers + calculate score
 */
router.post("/:code/submit", async (req, res) => {
  try {
    const { answers, user } = req.body || {};
    const test = await Test.findOne({ code: req.params.code });
    if (!test) return res.status(404).json({ success: false, message: "Test not found" });

    let score = 0;
    for (const q of test.questions) {
      const ans = answers?.[q.qno];
      if (!ans) continue;
      if (ans === q.correct) score += q.marks;
      else score -= q.negative;
    }

    const r = await Result.create({
      testCode: test.code,
      user,
      answers,
      score,
      timeTakenSec: req.body.timeTakenSec || 0,
    });

    res.json({ success: true, score, resultId: r._id });
  } catch (err) {
    console.error("Submit test error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/** GET /api/testseries/result/:id
 *  → Fetch a saved result (for ResultScreen)
 */
router.get("/result/:id", async (req, res) => {
  try {
    const r = await Result.findById(req.params.id);
    if (!r) return res.status(404).json({ success: false, message: "Result not found" });
    res.json({ success: true, result: r });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

/* =========================================================
   🔒 ADMIN ROUTES
   ========================================================= */

/** POST /api/testseries/import
 *  → Admin bulk import (text file or JSON)
 */
router.post("/import", isAdmin, upload.single("file"), async (req, res) => {
  try {
    const { paper, title, code } = req.body;
    if (!req.file) return res.status(400).json({ success: false, message: "No file uploaded" });

    const text = fs.readFileSync(req.file.path, "utf8");
    const lines = text.split(/\r?\n/).filter(Boolean);
    const questions = [];

    let current = null;
    for (const line of lines) {
      const qMatch = line.match(/^(\d+)\.\s*(.*)$/);
      if (qMatch) {
        if (current) questions.push(current);
        current = { qno: parseInt(qMatch[1]), text: qMatch[2], options: [] };
      } else if (/^\([a-d]\)/i.test(line)) {
        current?.options.push(line.trim());
      } else if (/^ans/i.test(line)) {
        const m = line.match(/\(([a-d])\)/i);
        if (m) current.correct = m[1].toUpperCase();
      }
    }
    if (current) questions.push(current);

    const testDoc = await Test.create({
      code: code || `T${Date.now()}`,
      paper: paper || "General",
      title: title || "Untitled Test",
      totalQuestions: questions.length,
      questions,
    });

    res.json({ success: true, message: "Imported successfully", test: testDoc });
  } catch (err) {
    console.error("Import error:", err);
    res.status(500).json({ success: false, message: err.message });
  }
});

/** DELETE /api/testseries/:code
 *  → Admin delete test
 */
router.delete("/:code", isAdmin, async (req, res) => {
  try {
    const del = await Test.findOneAndDelete({ code: req.params.code });
    if (!del) return res.status(404).json({ success: false, message: "Test not found" });
    res.json({ success: true, message: "Deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

export default router;
