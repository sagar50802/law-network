import Question from "../models/Question.js";

export async function getDashboard(req, res) {
  try {
    const examId = req.params.examId;

    const totalReleased = await Question.countDocuments({
      examId,
      isReleased: true,
    });

    const totalQuestions = await Question.countDocuments({ examId });

    return res.json({
      success: true,
      progress: {
        totalReleased,
        totalQuestions,
      },
    });
  } catch (err) {
    console.error("getDashboard error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
}

export async function getLiveQuestion(req, res) {
  try {
    const examId = req.params.examId;

    const q = await Question.findOne({
      examId,
      isReleased: true,
    })
      .sort({ releaseAt: -1 })
      .limit(1);

    return res.json({ success: true, question: q || null });
  } catch (err) {
    console.error("getLiveQuestion error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
}
