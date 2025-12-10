import express from "express";
import Question from "../../models/qna/Question.js";

const router = express.Router();

/* GET questions for subtopic */
router.get("/subtopics/:subtopicId/questions", async (req, res) => {
  try {
    const questions = await Question.find({ subtopicId: req.params.subtopicId })
      .sort({ releaseAt: 1 });

    res.json(questions);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* POST create question */
router.post("/subtopics/:subtopicId/questions", async (req, res) => {
  try {
    const question = await Question.create({
      subtopicId: req.params.subtopicId,
      ...req.body
    });
    res.status(201).json(question);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

/* PUT update question */
router.put("/questions/:id", async (req, res) => {
  try {
    const question = await Question.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(question);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

/* DELETE question */
router.delete("/questions/:id", async (req, res) => {
  try {
    await Question.findByIdAndDelete(req.params.id);
    res.json({ message: "Question deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
