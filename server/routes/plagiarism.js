import express from "express";
import { isAdmin } from "./utils.js";
import PlagiarismReport from "../models/PlagiarismReport.js";
import PDFDocument from "pdfkit"; // ✅ Added for report export

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
    if (s.split(" ").length > 25)
      issues.push("Long sentence: " + s.slice(0, 40) + "...");
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
      if (grammarIssues.some((g) => s.includes(g.split(":")[1]?.trim())))
        type = "grammar";
      if (maxMatch > 40 && s.length > 20 && Math.random() < 0.2)
        type = "plagiarized";
      return { sentence: s, type };
    });

    const report = new PlagiarismReport({
      userEmail,
      text,
      score: Math.round(100 - maxMatch),
      grammar: 100 - grammarIssues.length * 5,
      clarity: Math.max(
        60,
        100 - sentences.filter((s) => s.type === "grammar").length * 5
      ),
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

/* -----------------------------------------------------------
   🧩 GET /api/plagiarism/report/:id  → Generate PDF report
----------------------------------------------------------- */
router.get("/report/:id", async (req, res) => {
  try {
    const { id } = req.params;
    const report = await PlagiarismReport.findById(id);
    if (!report) return res.status(404).json({ error: "Report not found" });

    // Prepare PDF response
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="plagiarism_report_${id}.pdf"`
    );

    const doc = new PDFDocument({ margin: 40, size: "A4" });
    doc.pipe(res);

    /* ---------- Header ---------- */
    doc
      .fontSize(22)
      .fillColor("#4B0082")
      .text("LawNetwork - Plagiarism & Grammar Report", { align: "center" })
      .moveDown(1);

    /* ---------- Basic Info ---------- */
    doc
      .fontSize(12)
      .fillColor("#000")
      .text(`User Email: ${report.userEmail || "Anonymous"}`)
      .text(`Date: ${new Date(report.createdAt).toLocaleString()}`)
      .moveDown(0.5);

    /* ---------- Scores ---------- */
    doc
      .fontSize(14)
      .fillColor("#4B0082")
      .text("Analysis Summary:", { underline: true })
      .moveDown(0.5);

    const scores = [
      { label: "Originality", value: report.score, color: "#228B22" },
      { label: "Grammar", value: report.grammar, color: "#7B68EE" },
      { label: "Clarity", value: report.clarity, color: "#1E90FF" },
    ];

    scores.forEach((s) => {
      doc.fontSize(12).fillColor(s.color).text(`${s.label}: ${s.value}%`);
    });

    doc.moveDown(1);

    /* ---------- Sentence Highlights ---------- */
    doc
      .fontSize(14)
      .fillColor("#4B0082")
      .text("Detailed Analysis:", { underline: true });

    report.matches.forEach((m) => {
      const color =
        m.type === "plagiarized"
          ? "#FF4C4C"
          : m.type === "grammar"
          ? "#FFB84C"
          : "#4CAF50";
      doc.moveDown(0.3).fontSize(11).fillColor(color).text(`• ${m.sentence}`);
    });

    /* ---------- Suggestions ---------- */
    doc
      .moveDown(1)
      .fontSize(14)
      .fillColor("#4B0082")
      .text("Suggestions:", { underline: true });

    const suggestionList = [
      "Rephrase plagiarized lines to improve originality.",
      "Fix grammar issues highlighted in yellow.",
      "Keep sentence length short for better readability.",
      "Use your own words for legal definitions or case facts.",
    ];

    suggestionList.forEach((s) =>
      doc.moveDown(0.2).fontSize(11).fillColor("#000").text(`• ${s}`)
    );

    doc.end();
  } catch (err) {
    console.error("PDF generation failed:", err);
    res.status(500).json({ error: "Failed to generate report PDF." });
  }
});

export default router;
