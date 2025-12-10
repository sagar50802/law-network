import express from "express";
import Exam from "../../models/qna/Exam.js";

const router = express.Router();

/* GET /qna/exams */
router.get("/", async (req, res) => {
  try {
    const exams = await Exam.find().sort({ createdAt: -1 });
    res.json(exams);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* GET /qna/exams/:id */
router.get("/:id", async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ message: "Exam not found" });
    res.json(exam);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* POST /qna/exams */
router.post("/", async (req, res) => {
  try {
    const exam = await Exam.create(req.body);
    res.status(201).json(exam);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

/* PUT /qna/exams/:id */
router.put("/:id", async (req, res) => {
  try {
    const exam = await Exam.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(exam);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

/* DELETE /qna/exams/:id */
router.delete("/:id", async (req, res) => {
  try {
    await Exam.findByIdAndDelete(req.params.id);
    res.json({ message: "Exam deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* POST /qna/exams/:id/toggle-lock */
router.post("/:id/toggle-lock", async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.id);
    if (!exam) return res.status(404).json({ message: "Exam not found" });

    exam.isLocked = !exam.isLocked;
    await exam.save();

    res.json(exam);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
