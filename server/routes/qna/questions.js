const express = require("express");
const router = express.Router();
const ownerCheck = require("../../middleware/ownerCheck");

const Question = require("../../models/qna/Question");

/* PUBLIC — only released questions */
router.get("/:subtopicId/questions", async (req, res) => {
  const questions = await Question.find({
    subtopicId: req.params.subtopicId,
    releaseAt: { $lte: new Date() }
  }).sort({ order: 1, releaseAt: 1 });

  res.json(questions);
});

/* ADMIN VIEW — includes scheduled future questions */
router.get(
  "/admin/:subtopicId/all",
  ownerCheck,
  async (req, res) => {
    const questions = await Question.find({
      subtopicId: req.params.subtopicId,
    }).sort({ order: 1, releaseAt: 1 });

    res.json(questions);
  }
);

/* CREATE */
router.post("/:subtopicId/questions", ownerCheck, async (req, res) => {
  const q = await Question.create({
    subtopicId: req.params.subtopicId,
    questionText: req.body.questionText,
    answerText: req.body.answerText,
    releaseAt: req.body.releaseAt
  });
  res.json(q);
});

/* UPDATE */
router.put("/:id", ownerCheck, async (req, res) => {
  const updated = await Question.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(updated);
});

/* DELETE */
router.delete("/:id", ownerCheck, async (req, res) => {
  await Question.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

module.exports = router;
