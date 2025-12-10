import Exam from "../models/examModel.js";
import Unit from "../models/unitModel.js";
import Topic from "../models/topicModel.js";
import Subtopic from "../models/subtopicModel.js";
import Question from "../models/questionModel.js";

export const getSyllabusTree = async (req, res) => {
  try {
    const { examId } = req.params;

    // Fetch all units for this exam
    const units = await Unit.find({ examId }).sort({ order: 1 }).lean();

    const fullTree = [];

    for (const unit of units) {
      // Fetch topics for this unit
      const topics = await Topic.find({ unitId: unit._id })
        .sort({ order: 1 })
        .lean();

      const topicList = [];

      for (const topic of topics) {
        // Fetch subtopics for this topic
        const subtopics = await Subtopic.find({ topicId: topic._id })
          .sort({ order: 1 })
          .lean();

        const subtopicList = [];

        for (const st of subtopics) {
          // Count questions under this subtopic
          const qCount = await Question.countDocuments({
            subtopicId: st._id,
          });

          subtopicList.push({
            id: st._id,
            name: st.name,
            nameHindi: st.nameHindi,
            totalQuestions: qCount,
            isLocked: st.isLocked,
          });
        }

        topicList.push({
          id: topic._id,
          name: topic.name,
          nameHindi: topic.nameHindi,
          description: topic.description,
          totalSubtopics: subtopics.length,
          subtopics: subtopicList,
        });
      }

      fullTree.push({
        id: unit._id,
        name: unit.name,
        nameHindi: unit.nameHindi,
        description: unit.description,
        totalTopics: topics.length,
        topics: topicList,
      });
    }

    res.json(fullTree);
  } catch (error) {
    console.error("Syllabus tree error:", error);
    res.status(500).json({ message: "Failed to load syllabus" });
  }
};
