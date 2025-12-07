import Exam from "../models/Exam.js";
import Unit from "../models/Unit.js";
import Topic from "../models/Topic.js";
import Subtopic from "../models/Subtopic.js";
import Question from "../models/Question.js";

/* ----------------------- CREATE EXAM ----------------------- */
export const createExam = async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res
        .status(400)
        .json({ success: false, message: "Exam name is required" });
    }

    const exam = await Exam.create({ name });

    return res.json({ success: true, exam });
  } catch (err) {
    console.error("createExam error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* ----------------------- LIST EXAMS ------------------------ */
export const getAllExams = async (_req, res) => {
  try {
    const exams = await Exam.find().sort({ createdAt: -1 });
    return res.json({ success: true, exams });
  } catch (err) {
    console.error("getAllExams error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

/* -------------- FULL NESTED EXAM DETAIL -------------------- */
export const getExamDetail = async (req, res) => {
  try {
    const { examId } = req.params;

    const exam = await Exam.findById(examId);
    if (!exam) {
      return res
        .status(404)
        .json({ success: false, message: "Exam not found" });
    }

    const units = await Unit.find({ examId });
    const topics = await Topic.find({ unitId: { $in: units.map((u) => u._id) } });
    const subtopics = await Subtopic.find({
      topicId: { $in: topics.map((t) => t._id) },
    });
    const questions = await Question.find({
      subtopicId: { $in: subtopics.map((s) => s._id) },
    });

    const unitsNested = units.map((unit) => ({
      ...unit.toObject(),
      topics: topics
        .filter((t) => t.unitId.toString() === unit._id.toString())
        .map((topic) => ({
          ...topic.toObject(),
          subtopics: subtopics
            .filter((s) => s.topicId.toString() === topic._id.toString())
            .map((sub) => ({
              ...sub.toObject(),
              questions: questions.filter(
                (q) => q.subtopicId.toString() === sub._id.toString()
              ),
            })),
        })),
    }));

    return res.json({
      success: true,
      exam: {
        ...exam.toObject(),
        units: unitsNested,
      },
    });
  } catch (err) {
    console.error("getExamDetail error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};
