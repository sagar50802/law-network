// server/routes/plagiarism.js
const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const franc = require("franc");
const nspell = require("nspell");
const { htmlToText } = require("html-to-text");

const router = express.Router();

/* ---------------- Upload setup ---------------- */
const UP_DIR = path.join(__dirname, "..", "uploads", "plagiarism");
fs.mkdirSync(UP_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UP_DIR),
  filename: (_req, file, cb) => {
    const safe = Date.now() + "-" + file.originalname.replace(/\s+/g, "_");
    cb(null, safe);
  },
});

const upload = multer({
  storage,
  fileFilter: (_req, file, cb) => {
    // Allow only plain text or HTML-like files
    if (
      file.mimetype.includes("text") ||
      file.originalname.endsWith(".txt") ||
      file.originalname.endsWith(".html") ||
      file.originalname.endsWith(".htm")
    ) {
      cb(null, true);
    } else {
      cb(new Error("Only .txt or .html files are supported"));
    }
  },
});

/* ---------------- Spell checker ---------------- */
let SPELL = null;

async function loadSpell() {
  if (SPELL) return SPELL;

  const dictMod = await import("dictionary-en"); // ESM-safe import
  const loadDictionary = dictMod.default || dictMod;

  const dict = await new Promise((resolve, reject) => {
    loadDictionary((err, d) => {
      if (err) reject(err);
      else resolve(d);
    });
  });

  SPELL = nspell(dict);
  return SPELL;
}

/* ---------------- Helpers ---------------- */

// Extract plain text from HTML
function extractTextFromHTML(html) {
  try {
    return htmlToText(html, { wordwrap: 130 });
  } catch {
    return "";
  }
}

// Detect language
function detectLanguage(text) {
  try {
    return franc(text || "");
  } catch {
    return "und"; // undetermined
  }
}

// Analyze text for plagiarism-like issues
function analyzePlagiarism(text) {
  const sentences = text.split(/[.?!]\s+/);
  const result = {
    totalSentences: sentences.length,
    issues: [],
    words: text.split(/\s+/).length,
  };

  sentences.forEach((sentence, index) => {
    if (sentence.length < 15) return;

    const language = detectLanguage(sentence);
    if (language !== "eng" && language !== "und") {
      result.issues.push({ index, sentence, issue: "Non-English content", language });
    }

    if (sentence.split(/\s+/).length > 40) {
      result.issues.push({ index, sentence, issue: "Run-on sentence" });
    }
  });

  return result;
}

// Spell checker
async function analyzeSpelling(text) {
  const spell = await loadSpell();
  const words = text.match(/\b\w+\b/g) || [];

  const mistakes = [];
  const seen = new Set();

  for (const word of words) {
    const lower = word.toLowerCase();
    if (seen.has(lower)) continue; // skip duplicates
    seen.add(lower);

    if (!spell.correct(word)) {
      mistakes.push({
        word,
        suggestions: spell.suggest(word),
      });
    }
  }

  return mistakes;
}

/* ---------------- Routes ---------------- */

// POST /api/plagiarism/analyze
router.post("/analyze", upload.single("file"), async (req, res) => {
  const filePath = req.file?.path;
  if (!filePath) {
    return res.status(400).json({ success: false, error: "No file uploaded" });
  }

  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    const extracted = extractTextFromHTML(raw);
    const text = extracted || raw;

    const plagiarism = analyzePlagiarism(text);
    const spelling = await analyzeSpelling(text);

    res.json({
      success: true,
      summary: {
        totalSentences: plagiarism.totalSentences,
        totalWords: plagiarism.words,
        issuesFound: plagiarism.issues.length,
        spellingErrors: spelling.length,
      },
      issues: plagiarism.issues,
      spelling,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: "Error analyzing text", details: err.message });
  } finally {
    try {
      fs.unlinkSync(filePath);
    } catch {
      // ignore cleanup errors
    }
  }
});

module.exports = router;
