 import Exam from "../models/Exam.js";  // Now loads AnswerWritingExam correctly
import Unit from "../models/Unit.js";

export const createExam = async (req, res) => {
  try {
    const exam = await Exam.create({ name: req.body.name });
    res.json({ success: true, exam });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getExams = async (req, res) => {
  try {
    const exams = await Exam.find();
    res.json({ success: true, exams });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getExamDetail = async (req, res) => {
  try {
    const exam = await Exam.findById(req.params.examId)
      .populate({
        path: "units",
        populate: {
          path: "topics",
          populate: {
            path: "subtopics",
          },
        },
      });

    res.json({ success: true, exam });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
