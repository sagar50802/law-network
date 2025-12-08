 import Question from "../models/Question.js";
export const getDashboard = async (req, res) => {
  try {
    const examId = req.params.examId;

    const totalReleased = await Question.countDocuments({
      exam: examId,
      releaseTime: { $lte: new Date() },
    });

    const totalQuestions = await Question.countDocuments({ exam: examId });

    res.json({
      success: true,
      progress: {
        totalReleased,
        totalQuestions,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const getLiveQuestion = async (req, res) => {
  try {
    const examId = req.params.examId;

    const q = await Question.findOne({
      exam: examId,
      releaseTime: { $lte: new Date() },
    })
      .sort({ releaseTime: -1 })
      .limit(1);

    res.json({ success: true, question: q || null });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
