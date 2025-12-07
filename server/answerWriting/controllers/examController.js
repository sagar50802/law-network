// server/answerWriting/controllers/examController.js
import Exam from "../models/Exam.js";
import Unit from "../models/Unit.js";

export async function createExam(req, res) {
  try {
    const exam = await Exam.create({ name: req.body.name });
    res.json({ success: true, exam });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function getAllExams(_req, res) {
  try {
    const exams = await Exam.find().sort({ createdAt: 1 });
    res.json({ success: true, exams });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function getExamDetail(req, res) {
  try {
    const examId = req.params.examId;

    const exam = await Exam.findById(examId);
    if (!exam) {
      return res
        .status(404)
        .json({ success: false, message: "Exam not found" });
    }

    const units = await Unit.find({ examId }).sort({ createdAt: 1 });

    res.json({ success: true, exam, units });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}
