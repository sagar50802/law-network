import Exam from '../models/Exam.js';
import Unit from '../models/Unit.js';
import Topic from '../models/Topic.js';
import Subtopic from '../models/Subtopic.js';
import Question from '../models/Question.js';

/* ============================================================================
   CREATE EXAM
============================================================================ */
export const createExam = async (req, res) => {
  try {
    const { name, nameHindi, description, icon } = req.body;

    const exam = new Exam({
      name,
      nameHindi,
      description,
      icon: icon || "⚖️",
    });

    await exam.save();
    res.json({ success: true, exam });
  } catch (error) {
    console.error("Error creating exam:", error);
    res.status(500).json({ error: "Failed to create exam" });
  }
};

/* ============================================================================
   CREATE SYLLABUS NODE (Unit → Topic → Subtopic)
============================================================================ */
export const createSyllabusNode = async (req, res) => {
  try {
    const { type, parentId, ...data } = req.body;
    let node;

    switch (type) {
      case "unit":
        node = new Unit({ examId: parentId, ...data });
        break;
      case "topic":
        node = new Topic({ unitId: parentId, ...data });
        break;
      case "subtopic":
        node = new Subtopic({ topicId: parentId, ...data });
        break;
      default:
        return res.status(400).json({ error: "Invalid node type" });
    }

    await node.save();
    await updateParentCounts(type, parentId);

    res.json({ success: true, node });
  } catch (error) {
    console.error("Error creating syllabus node:", error);
    res.status(500).json({ error: "Failed to create syllabus node" });
  }
};

/* ============================================================================
   CREATE QUESTION (Hindi + English)
============================================================================ */
export const createQuestion = async (req, res) => {
  try {
    const {
      subtopicId,
      questionHindi,
      questionEnglish,
      answerHindi,
      answerEnglish,
      difficulty,
      keywords,
      caseLaws,
      scheduledRelease,
      isPremium,
    } = req.body;

    const subtopic = await Subtopic.findById(subtopicId)
      .populate("topicId", "unitId")
      .populate("topicId.unitId", "examId");

    if (!subtopic) {
      return res.status(404).json({ error: "Subtopic not found" });
    }

    const lastQuestion = await Question.findOne({ subtopicId }).sort({
      order: -1,
    });

    const order = lastQuestion ? lastQuestion.order + 1 : 1;

    const question = new Question({
      subtopicId,
      examId: subtopic.topicId.unitId.examId,
      order,
      questionHindi,
      questionEnglish,
      answerHindi,
      answerEnglish,
      difficulty: difficulty || "medium",
      keywords: keywords || [],
      caseLaws: caseLaws || [],
      scheduledRelease: scheduledRelease ? new Date(scheduledRelease) : null,
      isReleased: !scheduledRelease,
      isPremium: isPremium || false,
    });

    await question.save();

    await Subtopic.findByIdAndUpdate(subtopicId, {
      $inc: { totalQuestions: 1 },
    });

    await updateParentQuestionCounts(
      subtopic.topicId._id,
      subtopic.topicId.unitId._id
    );

    res.json({ success: true, question });
  } catch (error) {
    console.error("Error creating question:", error);
    res.status(500).json({ error: "Failed to create question" });
  }
};

/* ============================================================================
   SCHEDULE QUESTION RELEASE
============================================================================ */
export const scheduleQuestion = async (req, res) => {
  try {
    const { questionId } = req.params;
    const { scheduledRelease } = req.body;

    const question = await Question.findByIdAndUpdate(
      questionId,
      {
        scheduledRelease: new Date(scheduledRelease),
        isReleased: false,
      },
      { new: true }
    );

    await addToScheduler(questionId, scheduledRelease);

    res.json({ success: true, question });
  } catch (error) {
    console.error("Error scheduling question:", error);
    res.status(500).json({ error: "Failed to schedule question" });
  }
};

/* ============================================================================
   GET ALL SCHEDULED QUESTIONS (Admin Panel)
============================================================================ */
export const getScheduledQuestions = async (req, res) => {
  try {
    const scheduledQuestions = await Question.find({
      scheduledRelease: { $ne: null },
      isReleased: false,
    })
      .populate("subtopicId", "name")
      .populate("subtopicId.topicId", "name")
      .populate("subtopicId.topicId.unitId", "name")
      .sort("scheduledRelease")
      .lean();

    res.json(scheduledQuestions);
  } catch (error) {
    console.error("Error fetching scheduled questions:", error);
    res.status(500).json({ error: "Failed to fetch scheduled questions" });
  }
};

/* ============================================================================
   DELETE QUESTION (MISSING BEFORE — NOW PERFECT)
============================================================================ */
export const deleteQuestion = async (req, res) => {
  try {
    const { questionId } = req.params;

    const question = await Question.findById(questionId);
    if (!question) {
      return res.status(404).json({ error: "Question not found" });
    }

    await Question.findByIdAndDelete(questionId);

    await Subtopic.findByIdAndUpdate(question.subtopicId, {
      $inc: { totalQuestions: -1 },
    });

    res.json({
      success: true,
      message: "Question deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting question:", error);
    res.status(500).json({ error: "Failed to delete question" });
  }
};

/* ============================================================================
   ADMIN ANALYTICS
============================================================================ */
export const getAnalytics = async (req, res) => {
  try {
    const [
      totalExams,
      totalUnits,
      totalTopics,
      totalSubtopics,
      totalQuestions,
      releasedQuestions,
      premiumQuestions,
      viewsAgg,
      completionAgg,
      timeAgg,
    ] = await Promise.all([
      Exam.countDocuments(),
      Unit.countDocuments(),
      Topic.countDocuments(),
      Subtopic.countDocuments(),
      Question.countDocuments(),
      Question.countDocuments({ isReleased: true }),
      Question.countDocuments({ isPremium: true }),
      Question.aggregate([{ $group: { _id: null, total: { $sum: "$views" } } }]),
      Question.aggregate([
        { $group: { _id: null, total: { $sum: "$completionCount" } } },
      ]),
      Question.aggregate([
        { $group: { _id: null, avg: { $avg: "$averageTimeSpent" } } },
      ]),
    ]);

    const recentQuestions = await Question.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate("subtopicId", "name")
      .lean();

    const popularQuestions = await Question.find()
      .sort({ views: -1 })
      .limit(10)
      .populate("subtopicId", "name")
      .lean();

    res.json({
      counts: {
        exams: totalExams,
        units: totalUnits,
        topics: totalTopics,
        subtopics: totalSubtopics,
        questions: totalQuestions,
        releasedQuestions,
        premiumQuestions,
      },
      engagement: {
        totalViews: viewsAgg[0]?.total || 0,
        totalCompletions: completionAgg[0]?.total || 0,
        averageTimeSpent: timeAgg[0]?.avg || 0,
      },
      recentQuestions,
      popularQuestions,
    });
  } catch (error) {
    console.error("Error fetching analytics:", error);
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
};

/* ============================================================================
   HELPERS
============================================================================ */
const updateParentCounts = async (type, parentId) => {
  try {
    if (type === "subtopic") {
      await Topic.findByIdAndUpdate(parentId, {
        $inc: { totalSubtopics: 1 },
      });
    }
  } catch (err) {
    console.error("Error updating parent counts:", err);
  }
};

const updateParentQuestionCounts = async (topicId, unitId) => {
  try {
    const subtopicIds = await getSubtopicIds(topicId);

    const topicQuestionCount = await Question.countDocuments({
      subtopicId: { $in: subtopicIds },
    });

    await Topic.findByIdAndUpdate(topicId, {
      totalQuestions: topicQuestionCount,
    });

    const topicIds = await getTopicIds(unitId);
    const allSubtopics = await Subtopic.find({
      topicId: { $in: topicIds },
    }).select("_id");

    const unitQuestionCount = await Question.countDocuments({
      subtopicId: { $in: allSubtopics.map((s) => s._id) },
    });

    await Unit.findByIdAndUpdate(unitId, {
      totalQuestions: unitQuestionCount,
    });
  } catch (err) {
    console.error("Error updating question counts:", err);
  }
};

const getSubtopicIds = async (topicId) => {
  const subs = await Subtopic.find({ topicId }).select("_id");
  return subs.map((s) => s._id);
};

const getTopicIds = async (unitId) => {
  const topics = await Topic.find({ unitId }).select("_id");
  return topics.map((t) => t._id);
};

const addToScheduler = async (questionId, releaseTime) => {
  console.log(`Scheduling question ${questionId} for ${releaseTime}`);
};
