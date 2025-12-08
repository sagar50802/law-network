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
      releaseAt: req.body.releaseAt
    });

    res.json({ success: true, question: q });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
