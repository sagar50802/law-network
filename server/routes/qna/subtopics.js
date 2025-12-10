import express from "express";
import Subtopic from "../../models/qna/Subtopic.js";

const router = express.Router();

/* GET subtopics for topic */
router.get("/topics/:topicId/subtopics", async (req, res) => {
  try {
    const subtopics = await Subtopic.find({ topicId: req.params.topicId }).sort({ order: 1 });
    res.json(subtopics);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* POST create subtopic */
router.post("/topics/:topicId/subtopics", async (req, res) => {
  try {
    const subtopic = await Subtopic.create({
      topicId: req.params.topicId,
      name: req.body.name
    });
    res.status(201).json(subtopic);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

/* PUT update subtopic */
router.put("/subtopics/:id", async (req, res) => {
  try {
    const subtopic = await Subtopic.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(subtopic);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

/* DELETE subtopic */
router.delete("/subtopics/:id", async (req, res) => {
  try {
    await Subtopic.findByIdAndDelete(req.params.id);
    res.json({ message: "Subtopic deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
