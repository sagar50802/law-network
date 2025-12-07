// server/answerWriting/controllers/studentController.js

import Exam from "../models/Exam.js";
import Unit from "../models/Unit.js";
import Topic from "../models/Topic.js";
import Subtopic from "../models/Subtopic.js";
import Question from "../models/Question.js";

/* ---------------------------------------------------------
   STUDENT DASHBOARD — PROGRESS SUMMARY
--------------------------------------------------------- */
export async function getDashboard(req, res) {
  try {
    const { examId } = req.params;

    const totalQuestions = await Question.countDocuments({ examId });
    const releasedQuestions = await Question.countDocuments({
      examId,
      isReleased: true,
    });

    const completionPercent =
      totalQuestions === 0
        ? 0
        : Math.round((releasedQuestions / totalQuestions) * 100);

    res.json({
      success: true,
      progress: {
        totalQuestions,
        releasedQuestions,
        completionPercent,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

/* ---------------------------------------------------------
   LIVE QUESTION VIEW
--------------------------------------------------------- */
export async function getLiveQuestion(req, res) {
  try {
    const { examId } = req.params;

    // Fetch exam name
    const exam = await Exam.findById(examId);
    if (!exam) return res.status(404).json({ message: "Exam not found" });

    // 1️⃣   LAST RELEASED QUESTION (currently live)
    const currentQuestion = await Question.findOne({
      examId,
      isReleased: true,
    }).sort({ releaseAt: -1 });

    // 2️⃣   UPCOMING QUESTIONS (releaseAt > now)
    const upcoming = await Question.find({
      examId,
      isReleased: false,
      releaseAt: { $gt: new Date() },
    })
      .sort({ releaseAt: 1 })
      .limit(3);

    // 3️⃣   NEXT RELEASE TIME
    const nextReleaseAt = upcoming.length > 0 ? upcoming[0].releaseAt : null;

    // 4️⃣ Get unit name for display
    let unitName = "";
    if (currentQuestion?.unitId) {
      const unit = await Unit.findById(currentQuestion.unitId);
      unitName = unit ? unit.name : "";
    }

    // 5️⃣ Completion %
    const totalQuestions = await Question.countDocuments({ examId });
    const released = await Question.countDocuments({
      examId,
      isReleased: true,
    });

    const completionPercent =
      totalQuestions === 0
        ? 0
        : Math.round((released / totalQuestions) * 100);

    res.json({
      success: true,
      examName: exam.name,
      unitName,
      completionPercent,
      currentQuestion,
      nextReleaseAt,
      upcoming: upcoming.map((q) => ({
        _id: q._id,
        code: q.code || "Q" + q._id.slice(-4),
        title: q.englishText || q.hindiText || "Untitled",
        releaseAt: q.releaseAt,
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}
