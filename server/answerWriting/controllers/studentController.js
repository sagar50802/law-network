const Unit = require("../models/Unit");
const Topic = require("../models/Topic");
const Subtopic = require("../models/Subtopic");
const Question = require("../models/Question");

exports.getDashboard = async (req, res) => {
  const examId = req.params.examId;

  const total = await Question.countDocuments({ examId });
  const released = await Question.countDocuments({ examId, isReleased: true });
  const scheduled = await Question.countDocuments({
    examId,
    isReleased: false,
  });

  const upcoming = await Question.find({ examId, isReleased: false })
    .sort({ releaseAt: 1 })
    .limit(1);

  res.json({
    totalQuestions: total,
    coveredCount: released,
    scheduledCount: scheduled,
    nextTask: upcoming[0] || null,
  });
};

exports.getLiveQuestion = async (req, res) => {
  const examId = req.params.examId;

  const current = await Question.findOne({
    examId,
    isReleased: true,
  }).sort({ releaseAt: -1 });

  const next = await Question.findOne({
    examId,
    isReleased: false,
  }).sort({ releaseAt: 1 });

  res.json({
    currentQuestion: current,
    nextReleaseAt: next?.releaseAt,
  });
};
