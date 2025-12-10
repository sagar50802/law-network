import Exam from "../models/Exam.js";
import Unit from "../models/Unit.js";
import Topic from "../models/Topic.js";
import Subtopic from "../models/Subtopic.js";
import Question from "../models/Question.js";

/* =============================================================================
   EXAMS & SYLLABUS
============================================================================= */

// Create new exam
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

// Create syllabus node: unit / topic / subtopic
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

/* -----------------------------------------------------------------------------
   UPDATE SYLLABUS NODE (NEW — REQUIRED)
----------------------------------------------------------------------------- */
export const updateSyllabusNode = async (req, res) => {
  try {
    const { type, id } = req.params;
    const updates = req.body;

    let Model;
    if (type === "unit") Model = Unit;
    else if (type === "topic") Model = Topic;
    else if (type === "subtopic") Model = Subtopic;
    else return res.status(400).json({ error: "Invalid node type" });

    const updatedNode = await Model.findByIdAndUpdate(id, updates, {
      new: true,
    });

    if (!updatedNode) {
      return res.status(404).json({ error: "Node not found" });
    }

    res.json({ success: true, updatedNode });
  } catch (error) {
    console.error("Error updating syllabus node:", error);
    res.status(500).json({ error: "Failed to update syllabus node" });
  }
};

/* -----------------------------------------------------------------------------
   DELETE SYLLABUS NODE (NEW — REQUIRED)
----------------------------------------------------------------------------- */
export const deleteSyllabusNode = async (req, res) => {
  try {
    const { type, id } = req.params;

    if (type === "unit") {
      const topics = await Topic.find({ unitId: id });
      for (const t of topics) {
        await Subtopic.deleteMany({ topicId: t._id });
      }
      await Topic.deleteMany({ unitId: id });
      await Unit.findByIdAndDelete(id);
    }

    else if (type === "topic") {
      await Subtopic.deleteMany({ topicId: id });
      await Topic.findByIdAndDelete(id);
    }

    else if (type === "subtopic") {
      await Subtopic.findByIdAndDelete(id);
    }

    else {
      return res.status(400).json({ error: "Invalid node type" });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting syllabus node:", error);
    res.status(500).json({ error: "Failed to delete syllabus node" });
  }
};

/* -----------------------------------------------------------------------------
   REORDER SYLLABUS (NEW — REQUIRED)
----------------------------------------------------------------------------- */
export const reorderSyllabus = async (req, res) => {
  try {
    const { type } = req.params;
    const { items } = req.body;

    let Model;
    if (type === "unit") Model = Unit;
    else if (type === "topic") Model = Topic;
    else if (type === "subtopic") Model = Subtopic;
    else return res.status(400).json({ error: "Invalid type" });

    for (const item of items) {
      await Model.findByIdAndUpdate(item.id, { order: item.order });
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error reordering syllabus:", error);
    res.status(500).json({ error: "Failed to reorder syllabus" });
  }
};

/* =============================================================================
   QUESTIONS
============================================================================= */

// Create bilingual question
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
      .populate({
        path: "topicId",
        populate: { path: "unitId", select: "examId" },
      })
      .lean();

    if (!subtopic) {
      return res.status(404).json({ error: "Subtopic not found" });
    }

    const examId = subtopic.topicId.unitId.examId;

    const lastQuestion = await Question.findOne({ subtopicId })
      .sort({ order: -1 })
      .lean();
    const order = lastQuestion ? lastQuestion.order + 1 : 1;

    const question = new Question({
      subtopicId,
      examId,
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
      isPremium: !!isPremium,
    });

    await question.save();

    await Subtopic.findByIdAndUpdate(subtopicId, {
      $inc: { totalQuestions: 1 },
    }).catch(() => {});

    res.json({ success: true, question });
  } catch (error) {
    console.error("Error creating question:", error);
    res.status(500).json({ error: "Failed to create question" });
  }
};

// List questions
export const getQuestions = async (req, res) => {
  try {
    const { subtopicId } = req.query;
    const filter = {};
    if (subtopicId) filter.subtopicId = subtopicId;

    const questions = await Question.find(filter)
      .sort({ createdAt: -1 })
      .populate("subtopicId", "name")
      .lean();

    res.json({ success: true, questions });
  } catch (error) {
    console.error("Error fetching questions:", error);
    res.status(500).json({ error: "Failed to fetch questions" });
  }
};

// Delete question
export const deleteQuestion = async (req, res) => {
  try {
    const { questionId } = req.params;

    const q = await Question.findById(questionId);
    if (!q) {
      return res.status(404).json({ error: "Question not found" });
    }

    await Question.deleteOne({ _id: questionId });

    if (q.subtopicId) {
      await Subtopic.findByIdAndUpdate(q.subtopicId, {
        $inc: { totalQuestions: -1 },
      }).catch(() => {});
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting question:", error);
    res.status(500).json({ error: "Failed to delete question" });
  }
};

/* =============================================================================
   SCHEDULING
============================================================================= */

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

    if (!question) {
      return res.status(404).json({ error: "Question not found" });
    }

    await addToScheduler(questionId, scheduledRelease);

    res.json({ success: true, question });
  } catch (error) {
    console.error("Error scheduling question:", error);
    res.status(500).json({ error: "Failed to schedule question" });
  }
};

export const getScheduledQuestions = async (req, res) => {
  try {
    const scheduledQuestions = await Question.find({
      scheduledRelease: { $ne: null },
      isReleased: false,
    })
      .populate("subtopicId", "name")
      .sort("scheduledRelease")
      .lean();

    res.json({ success: true, questions: scheduledQuestions });
  } catch (error) {
    console.error("Error fetching scheduled questions:", error);
    res.status(500).json({ error: "Failed to fetch scheduled questions" });
  }
};

/* =============================================================================
   ANALYTICS
============================================================================= */

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
      totalViewsAgg,
      totalCompletionsAgg,
      averageTimeSpentAgg,
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
        totalViews: totalViewsAgg[0]?.total || 0,
        totalCompletions: totalCompletionsAgg[0]?.total || 0,
        averageTimeSpent: averageTimeSpentAgg[0]?.avg || 0,
      },
      recentQuestions,
      popularQuestions,
    });
  } catch (error) {
    console.error("Error fetching analytics:", error);
    res.status(500).json({ error: "Failed to fetch analytics" });
  }
};

/* =============================================================================
   HELPERS
============================================================================= */

const updateParentCounts = async (type, parentId) => {
  try {
    if (type === "subtopic") {
      await Topic.findByIdAndUpdate(parentId, {
        $inc: { totalSubtopics: 1 },
      }).catch(() => {});
    }
  } catch (error) {
    console.error("Error updating parent counts:", error);
  }
};

// Dummy scheduler hook
const addToScheduler = async (questionId, releaseTime) => {
  console.log(`Scheduling question ${questionId} for release at ${releaseTime}`);
};
