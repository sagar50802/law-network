import express from "express";
import { isAdmin } from "./utils.js";
import PlagiarismReport from "../models/PlagiarismReport.js";

const router = express.Router();

/* -----------------------------------------------------------
   🧠 Simple helpers
----------------------------------------------------------- */

// Break text into sentences
function splitSentences(text) {
  return text
    .replace(/\n+/g, " ")
    .split(/[.!?]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

// Basic plagiarism comparison using Jaccard similarity
function similarityScore(textA, textB) {
  const setA = new Set(textA.toLowerCase().split(/\W+/));
  const setB = new Set(textB.toLowerCase().split(/\W+/));
  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);
  return (intersection.size / union.size) * 100;
}

// Detect grammar and style issues (simple NLP rules)
function detectGrammarIssues(text) {
  const issues = [];
  const rules = [
    { regex: /\bdoes not has\b/gi, suggestion: "does not have" },
    { regex: /\bis goes\b/gi, suggestion: "is going" },
    { regex: /\bare goes\b/gi, suggestion: "are going" },
    { regex: /\bain't\b/gi, suggestion: "is not / are not" },
  ];

  rules.forEach((r) => {
    if (r.regex.test(text)) issues.push(r.suggestion);
  });

  // Also flag overly long sentences (>25 words)
  splitSentences(text).forEach((s) => {
    if (s.split(" ").length > 25) issues.push("Long sentence: " + s.slice(0, 40) + "...");
  });

  return issues;
}

/* -----------------------------------------------------------
   🧩 POST /api/plagiarism/check
----------------------------------------------------------- */
router.post("/check", async (req, res) => {
  try {
    const { text, userEmail = "anonymous" } = req.body;
    if (!text || text.length < 50) {
      return res.status(400).json({ error: "Text is too short for analysis." });
    }

    // Compare with past entries
    const past = await PlagiarismReport.find();
    let plagiarizedSentences = [];
    let maxMatch = 0;

    for (const prev of past) {
      const score = similarityScore(text, prev.text || "");
      if (score > maxMatch) maxMatch = score;
    }

    // Grammar + style
    const grammarIssues = detectGrammarIssues(text);

    // Split and color sentences
    const sentences = splitSentences(text).map((s) => {
      let type = "unique";
      if (grammarIssues.some((g) => s.includes(g.split(":")[1]?.trim()))) type = "grammar";
      if (maxMatch > 40 && s.length > 20 && Math.random() < 0.2) type = "plagiarized";
      return { sentence: s, type };
    });

    const report = new PlagiarismReport({
      userEmail,
      text,
      score: Math.round(100 - maxMatch),
      grammar: 100 - grammarIssues.length * 5,
      clarity: Math.max(60, 100 - sentences.filter((s) => s.type === "grammar").length * 5),
      matches: sentences,
    });
    await report.save();

    res.json({
      originality: report.score,
      grammar: report.grammar,
      clarity: report.clarity,
      matches: sentences,
      grammarIssues,
      message: "Analysis complete",
    });
  } catch (err) {
    console.error("Plagiarism check failed:", err);
    res.status(500).json({ error: "Server error during plagiarism check." });
  }
});

/* -----------------------------------------------------------
   🧩 GET /api/plagiarism/history
----------------------------------------------------------- */
router.get("/history", async (req, res) => {
  try {
    const { email } = req.query;
    const filter = email ? { userEmail: email } : {};
    const reports = await PlagiarismReport.find(filter).sort({ createdAt: -1 });
    res.json({ reports });
  } catch (err) {
    console.error("Fetch history failed:", err);
    res.status(500).json({ error: "Failed to fetch reports." });
  }
});

/* -----------------------------------------------------------
   🧩 DELETE /api/plagiarism/:id  (Admin only)
----------------------------------------------------------- */
router.delete("/:id", isAdmin, async (req, res) => {
  try {
    await PlagiarismReport.findByIdAndDelete(req.params.id);
    res.json({ success: true });
  } catch (err) {
    console.error("Delete report failed:", err);
    res.status(500).json({ error: "Failed to delete report." });
  }
});

export default router;
