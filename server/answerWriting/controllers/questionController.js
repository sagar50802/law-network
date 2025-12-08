import Question from "../models/Question.js";

export const createQuestion = async (req, res) => {
  try {
    const q = await Question.create({
      exam: req.params.examId,
      unit: req.body.unit,
      topic: req.body.topic,
      subtopic: req.body.subtopic || null,

      questionHindi: req.body.questionHindi,
      questionEnglish: req.body.questionEnglish,
      answerHindi: req.body.answerHindi,
      answerEnglish: req.body.answerEnglish,

      releaseTime: req.body.releaseTime,
    });

    res.json({ success: true, question: q });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteQuestion = async (req, res) => {
  try {
    await Question.findByIdAndDelete(req.params.questionId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getReleasedQuestions = async (req, res) => {
  try {
    const now = new Date();

    const questions = await Question.find({
      exam: req.params.examId,
      releaseTime: { $lte: now },
    }).sort({ releaseTime: 1 });

    res.json({ success: true, questions });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
