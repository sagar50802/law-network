import Exam from "../models/Exam.js";
import Unit from "../models/Unit.js";
import Topic from "../models/Topic.js";
import Subtopic from "../models/Subtopic.js";
import Question from "../models/Question.js";

/* ---------------------------------------------------------
   CREATE EXAM
--------------------------------------------------------- */
export const createExam = async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({ message: "Exam name is required" });
    }

    const exam = await Exam.create({ name });

    res.json({
      message: "Exam created successfully",
      exam,
    });
  } catch (err) {
    console.error("❌ createExam error:", err);
    res.status(500).json({ message: "Server error", error: err.message });
  }
};

/* ---------------------------------------------------------
   GET ALL EXAMS
--------------------------------------------------------- */
export const getAllExams = async (_req, res) => {
  try {
    const exams = await Exam.find().sort({ createdAt: -1 });

    res.json({ exams });
  } catch (err) {
    console.error("❌ getAllExams error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

/* ---------------------------------------------------------
   GET FULL EXAM DETAIL (UNITS → TOPICS → SUBTOPICS → QUESTIONS)
--------------------------------------------------------- */
export const getExamDetail = async (req, res) => {
  try {
    const { examId } = req.params;

    const exam = await Exam.findById(examId);
    if (!exam) return res.status(404).json({ message: "Exam not found" });

    const units = await Unit.find({ examId });

    const topics = await Topic.find({
      unitId: { $in: units.map((u) => u._id) },
    });

    const subtopics = await Subtopic.find({
      topicId: { $in: topics.map((t) => t._id) },
    });

    const questions = await Question.find({
      subtopicId: { $in: subtopics.map((s) => s._id) },
    });

    res.json({
      exam,
      units,
      topics,
      subtopics,
      questions,
    });
  } catch (err) {
    console.error("❌ getExamDetail error:", err);
    res.status(500).json({ message: "Server error" });
  }
};
