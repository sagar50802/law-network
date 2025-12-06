const Exam = require("../models/Exam");
const Unit = require("../models/Unit");
const Topic = require("../models/Topic");
const Subtopic = require("../models/Subtopic");
const Question = require("../models/Question");
const { findExamByParam } = require("./examController");

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * GET /api/answer-writing/student/:examId/dashboard
 * Returns the exact shape that AnswerDashboard.jsx expects.
 */
exports.getDashboard = async (req, res) => {
  try {
    const { examId } = req.params;
    const exam = await findExamByParam(examId);
    if (!exam) return res.status(404).json({ message: "Exam not found" });

    const now = new Date();
    const todayStart = startOfToday();

    // Load structure
    const units = await Unit.find({ examId: exam._id }).sort("createdAt").lean();
    const unitIds = units.map((u) => u._id);

    const topics = await Topic.find({ unitId: { $in: unitIds } })
      .sort("createdAt")
      .lean();
    const topicIds = topics.map((t) => t._id);

    const subtopics = await Subtopic.find({ topicId: { $in: topicIds } })
      .sort("createdAt")
      .lean();
    const subtopicIds = subtopics.map((s) => s._id);

    const questions = await Question.find({ subtopicId: { $in: subtopicIds } })
      .sort("releaseAt")
      .lean();

    const totalCount = questions.length;
    const coveredQuestions = questions.filter((q) => q.releaseAt <= now);
    const coveredCount = coveredQuestions.length;
    const scheduledCount = totalCount - coveredCount;

    const overallPercent =
      totalCount === 0
        ? 0
        : Math.round((coveredCount / Math.max(totalCount, 1)) * 100);

    // Next task
    const next = questions.find((q) => q.releaseAt > now) || null;
    let nextTask = null;
    if (next) {
      const topic = topics.find(
        (t) => String(t._id) === String(next.topicId)
      );
      const unit = units.find((u) => String(u._id) === String(next.unitId));
      nextTask = {
        topicName: topic && unit ? `${unit.name} – ${topic.name}` : "Next task",
        releaseAt: next.releaseAt,
      };
    }

    // Daily released questions (global, not per-student yet)
    const dailyTaskWatch = questions.filter(
      (q) => q.releaseAt >= todayStart && q.releaseAt <= now
    ).length;

    // Subject progress per unit
    const subjectProgress = units.map((u) => {
      const qOfUnit = questions.filter(
        (q) => String(q.unitId) === String(u._id)
      );
      const done = qOfUnit.filter((q) => q.releaseAt <= now).length;
      const total = qOfUnit.length || 1;
      const value = Math.round((done / total) * 100);
      return {
        name: u.name,
        value,
      };
    });

    // Units → topics → subtopics tree
    const subsByTopic = {};
    subtopics.forEach((s) => {
      const key = String(s.topicId);
      if (!subsByTopic[key]) subsByTopic[key] = [];
      subsByTopic[key].push({
        id: s._id,
        name: s.name,
      });
    });

    const questionsByTopic = {};
    questions.forEach((q) => {
      const key = String(q.topicId);
      if (!questionsByTopic[key]) questionsByTopic[key] = 0;
      questionsByTopic[key]++;
    });

    const topicsByUnit = {};
    topics.forEach((t) => {
      const key = String(t.unitId);
      if (!topicsByUnit[key]) topicsByUnit[key] = [];
      topicsByUnit[key].push({
        id: t._id,
        name: t.name,
        locked: t.locked,
        hasScheduledQuestions: !!questionsByTopic[String(t._id)],
        subtopics: subsByTopic[String(t._id)] || [],
      });
    });

    const unitsTree = units.map((u) => ({
      id: u._id,
      name: u.name,
      locked: u.locked,
      topics: topicsByUnit[String(u._id)] || [],
    }));

    res.json({
      examName: exam.name,
      overallPercent,
      coveredCount,
      scheduledCount,
      totalCount,
      nextTask,
      dailyTaskWatch,
      subjectProgress,
      units: unitsTree,
    });
  } catch (err) {
    console.error("getDashboard error", err);
    res.status(500).json({ message: "Failed to load dashboard" });
  }
};

/**
 * GET /api/answer-writing/student/:examId/live-question
 * Returns live question + upcoming list.
 */
exports.getLiveQuestion = async (req, res) => {
  try {
    const { examId } = req.params;
    const exam = await findExamByParam(examId);
    if (!exam) return res.status(404).json({ message: "Exam not found" });

    const now = new Date();

    const units = await Unit.find({ examId: exam._id }).lean();
    const unitIds = units.map((u) => u._id);
    const topics = await Topic.find({ unitId: { $in: unitIds } }).lean();
    const topicIds = topics.map((t) => t._id);
    const subtopics = await Subtopic.find({ topicId: { $in: topicIds } }).lean();
    const subtopicIds = subtopics.map((s) => s._id);

    const questions = await Question.find({ subtopicId: { $in: subtopicIds } })
      .sort("releaseAt")
      .lean();

    if (!questions.length) {
      return res.json(null); // frontend already handles "no data" case
    }

    const released = questions.filter((q) => q.releaseAt <= now);
    const upcoming = questions.filter((q) => q.releaseAt > now);

    if (!released.length) {
      // None released yet
      return res.json(null);
    }

    const current = released[released.length - 1];

    const completionPercent = Math.round(
      (released.length / questions.length) * 100
    );

    // compute code like Q1, Q2 ... based on order
    const index = questions.findIndex(
      (q) => String(q._id) === String(current._id)
    );
    const code = `Q${index + 1}`;

    const topic = topics.find(
      (t) => String(t._id) === String(current.topicId)
    );
    const unit = units.find((u) => String(u._id) === String(current.unitId));

    const unitName =
      unit && topic ? `${unit.name} – ${topic.name}` : unit?.name || "";

    const nextReleaseAt = upcoming[0]?.releaseAt || null;

    const upcomingList = upcoming.slice(0, 5).map((q) => {
      const idx = questions.findIndex(
        (qq) => String(qq._id) === String(q._id)
      );
      const t = topics.find(
        (tt) => String(tt._id) === String(q.topicId)
      );
      return {
        code: `Q${idx + 1}`,
        title: t ? t.name : "Upcoming question",
        releaseAt: q.releaseAt,
      };
    });

    res.json({
      examName: exam.name,
      unitName,
      completionPercent,
      currentQuestion: {
        id: current._id,
        code,
        hindiText: current.hindiText,
        englishText: current.englishText,
        releaseAt: current.releaseAt,
        isReleased: current.releaseAt <= now,
        topicName: topic?.name || "",
      },
      nextReleaseAt,
      upcoming: upcomingList,
    });
  } catch (err) {
    console.error("getLiveQuestion error", err);
    res.status(500).json({ message: "Failed to load live question" });
  }
};
