const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const franc = require("franc");
const nspell = require("nspell");
const { htmlToText } = require("html-to-text");

const router = express.Router();
const upload = multer({ dest: "uploads/" });

let SPELL = null;

// Load English dictionary for nspell
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

// Extract plain text from HTML content
function extractTextFromHTML(html) {
  try {
    return htmlToText(html, { wordwrap: 130 });
  } catch (err) {
    return "";
  }
}

// Language detection
function detectLanguage(text) {
  try {
    return franc(text || "");
  } catch {
    return "und"; // undetermined
  }
}

// Analyze plagiarism-like issues (basic linguistic analysis)
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
    if (language !== "eng") {
      result.issues.push({ index, sentence, issue: "Non-English content", language });
    }

    if (sentence.split(/\s+/).length > 40) {
      result.issues.push({ index, sentence, issue: "Run-on sentence" });
    }
  });

  return result;
}

// Spell checker using nspell
async function analyzeSpelling(text) {
  const spell = await loadSpell();
  const words = text.match(/\b\w+\b/g) || [];

  const mistakes = [];

  for (const word of words) {
    if (!spell.correct(word)) {
      mistakes.push({
        word,
        suggestions: spell.suggest(word),
      });
    }
  }

  return mistakes;
}

// Main API Route
// POST /api/plagiarism/analyze
router.post("/analyze", upload.single("file"), async (req, res) => {
  const filePath = req.file?.path;

  if (!filePath) {
    return res.status(400).json({ error: "No file uploaded" });
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
    res.status(500).json({ error: "Error analyzing text", details: err.message });
  } finally {
    try {
      fs.unlinkSync(filePath);
    } catch (e) {
      console.warn("Failed to delete uploaded file:", e.message);
    }
  }
});

module.exports = router;
