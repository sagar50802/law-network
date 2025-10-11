import express from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import mongoose from "mongoose";
import { isAdmin } from "./utils.js";

const router = express.Router();

/* ---------- Upload dir ---------- */
const UP_DIR = path.join(process.cwd(), "server", "uploads", "testseries");
if (!fs.existsSync(UP_DIR)) fs.mkdirSync(UP_DIR, { recursive: true });

/* ---------- Multer setup ---------- */
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UP_DIR),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/\s+/g, "_").replace(/[^\w.\-]/g, "");
    cb(null, Date.now() + "_" + safe);
  },
});
const upload = multer({ storage });

/* ---------- Mongoose Schemas ---------- */
const TestSchema = new mongoose.Schema(
  {
    code: { type: String, unique: true, required: true },
    paper: { type: String, required: true },
    title: { type: String, required: true },
    durationMin: { type: Number, default: 120 },
    totalQuestions: { type: Number, default: 150 },
    questions: [
      {
        qno: Number,
        text: String,
        options: [String], // raw lines like (a) text
        correct: String,   // normalized A..E
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
    user: { email: String, name: String },
    answers: Object, // { [qno]: "A"/"B"/... }
    score: Number,
    timeTakenSec: Number,
  },
  { timestamps: true }
);

const Test = mongoose.models.TestSeries || mongoose.model("TestSeries", TestSchema);
const Result = mongoose.models.TestResult || mongoose.model("TestResult", ResultSchema);

/* =========================================================
   Helpers
   ========================================================= */
function normLetter(v) {
  if (v == null) return undefined;
  let s = String(v).trim().toUpperCase();

  // 1..5 → A..E
  const n = Number(s);
  if (!isNaN(n) && n >= 1 && n <= 5) return String.fromCharCode(64 + n);

  // remove noise like (b), Option b
  s = s.replace(/^\(|\)$/g, "");
  s = s.replace(/^OPTION\s*/i, "");
  s = s.replace(/[^A-E]/g, "");
  return s ? s[0] : undefined;
}

/**
 * Parse plain text question file like:
 * 10. Question
 * (a) optA
 * (b) optB
 * (c) optC
 * (d) optD
 * Ans. (b)
 * [optional explanation lines...]
 */
function parsePlainTextToQuestions(text) {
  const lines = String(text).split(/\r?\n/);
  const out = [];
  let current = null;

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;

    const qMatch = line.match(/^(\d+)\.\s*(.*)$/);
    if (qMatch) {
      if (current) out.push(current);
      current = { qno: parseInt(qMatch[1], 10), text: qMatch[2], options: [] };
      continue;
    }

    // option lines
    if (/^\([a-e]\)/i.test(line)) {
      current?.options.push(line);
      continue;
    }

    // answer line
    const aMatch = line.match(/^ans(?:wer)?\s*[.:]?\s*\(?([a-e1-5])\)?/i);
    if (aMatch) {
      current && (current.correct = normLetter(aMatch[1]));
      continue;
    }
  }

  if (current) out.push(current);

  // normalize
  return out.map((q, i) => ({
    qno: Number(q.qno ?? i + 1),
    text: String(q.text ?? ""),
    options: Array.isArray(q.options) ? q.options.map(String) : [],
    correct: normLetter(q.correct),
    marks: Number(q.marks ?? 1),
    negative: Number(q.negative ?? 0.33),
  }));
}

function normalizeJSONQuestions(obj) {
  const arr = Array.isArray(obj?.questions)
    ? obj.questions
    : Array.isArray(obj)
    ? obj
    : [];

  return arr.map((q, i) => {
    let correct = normLetter(q.correct);
    if (!correct && Array.isArray(q.options)) {
      const raw = String(q.correct || "").trim().toUpperCase();
      const idx = q.options.map(String).findIndex((o) => o.trim().toUpperCase() === raw);
      if (idx >= 0) correct = String.fromCharCode(65 + idx);
    }

    return {
      qno: Number(q.qno ?? i + 1),
      text: String(q.text ?? ""),
      options: Array.isArray(q.options) ? q.options.map(String) : [],
      correct,
      marks: Number(q.marks ?? 1),
      negative: Number(q.negative ?? 0.33),
    };
  });
}

async function readAnyToText(file) {
  const p = file?.path;
  const ext = path.extname(file?.originalname || "").toLowerCase();
  if (!p) return "";
  if (ext === ".json" || ext === ".txt") return fs.readFileSync(p, "utf8");
  if (ext === ".docx") {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.extractRawText({ path: p });
    return value || "";
  }
  return fs.readFileSync(p, "utf8");
}

/* =========================================================
   Public/Admin routes
   ========================================================= */

// list grouped by paper
router.get("/", async (_req, res) => {
  try {
    const all = await Test.find({}, "paper title code totalQuestions durationMin").sort({
      paper: 1,
      createdAt: -1,
    });
    const grouped = {};
    for (const t of all) {
      if (!grouped[t.paper]) grouped[t.paper] = [];
      grouped[t.paper].push(t);
    }
    res.json({ success: true, papers: grouped });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/results", isAdmin, async (_req, res) => {
  try {
    const results = await Result.find().sort({ createdAt: -1 });
    res.json({ success: true, results });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/tests", async (_req, res) => {
  try {
    const list = await Test.find(
      {},
      "paper title code totalQuestions durationMin createdAt"
    ).sort({ paper: 1, createdAt: -1 });
    res.json({ success: true, tests: list });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/papers", async (_req, res) => {
  try {
    const agg = await Test.aggregate([
      { $group: { _id: "$paper", count: { $sum: 1 } } },
      { $project: { _id: 0, paper: "$_id", count: 1 } },
      { $sort: { paper: 1 } },
    ]);
    res.json({ success: true, papers: agg });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.delete("/paper/:paper", isAdmin, async (req, res) => {
  try {
    const out = await Test.deleteMany({ paper: req.params.paper });
    res.json({ success: true, deleted: out.deletedCount || 0 });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/result/:id", async (req, res) => {
  try {
    const r = await Result.findById(req.params.id);
    if (!r) return res.status(404).json({ success: false, message: "Result not found" });

    // include question set for review
    const t = await Test.findOne({ code: r.testCode });
    const questions = t?.questions?.map((q) => ({
      qno: q.qno,
      text: q.text,
      options: q.options,
      correct: normLetter(q.correct),
    })) || [];

    res.json({ success: true, result: r, questions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/import", isAdmin, upload.single("file"), async (req, res) => {
  try {
    const { paper, title, code, rawText } = req.body;
    let questions = [];

    if (rawText && rawText.trim()) {
      questions = parsePlainTextToQuestions(rawText);
    } else if (req.file) {
      const ext = path.extname(req.file.originalname).toLowerCase();
      if (ext === ".json") {
        const json = JSON.parse(await readAnyToText(req.file));
        questions = normalizeJSONQuestions(json);
      } else {
        const text = await readAnyToText(req.file);
        questions = parsePlainTextToQuestions(text);
      }
    } else {
      return res.status(400).json({
        success: false,
        message: "Provide rawText or upload a file (.txt, .json, .docx)",
      });
    }

    questions = questions.map((q, i) => ({
      qno: Number(q.qno ?? i + 1),
      text: String(q.text ?? ""),
      options: Array.isArray(q.options) ? q.options.map(String) : [],
      correct: normLetter(q.correct),
      marks: Number(q.marks ?? 1),
      negative: Number(q.negative ?? 0.33),
    }));

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

/* =========================================================
   Param routes
   ========================================================= */

router.get("/:code/play", async (req, res) => {
  try {
    const t = await Test.findOne({ code: req.params.code });
    if (!t) return res.status(404).json({ success: false, message: "Test not found" });

    const questions = (t.questions || []).map((q, i) => ({
      qno: Number(q.qno ?? i + 1),
      text: String(q.text ?? ""),
      options: Array.isArray(q.options) ? q.options.map(String) : [],
      correct: normLetter(q.correct), // visible for answer review
    }));

    res.json({ success: true, questions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.post("/:code/submit", async (req, res) => {
  try {
    const { answers, user } = req.body || {};
    const test = await Test.findOne({ code: req.params.code });
    if (!test) return res.status(404).json({ success: false, message: "Test not found" });

    let score = 0;
    for (const q of test.questions) {
      const correct = normLetter(q.correct);
      if (!correct) continue;
      const pick = normLetter(answers?.[q.qno]);
      if (!pick) continue;
      if (pick === correct) score += Number(q.marks ?? 1);
      else score -= Number(q.negative ?? 0.33);
    }

    const r = await Result.create({
      testCode: test.code,
      user,
      answers,
      score,
      timeTakenSec: req.body?.timeTakenSec || 0,
    });

    res.json({ success: true, score, resultId: r._id });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

router.get("/:code", async (req, res) => {
  try {
    const t = await Test.findOne({ code: req.params.code });
    if (!t) return res.status(404).json({ success: false, message: "Test not found" });
    const { title, durationMin, totalQuestions, paper } = t;
    res.json({ success: true, test: { title, durationMin, totalQuestions, paper } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
});

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
