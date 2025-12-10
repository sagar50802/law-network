import Unit from "../models/unitModel.js";
import Topic from "../models/topicModel.js";
import Subtopic from "../models/subtopicModel.js";
import Question from "../models/questionModel.js";

export const getSyllabusTree = async (req, res) => {
  try {
    const { examId } = req.params;

    // Fetch units
    const units = await Unit.find({ examId }).sort({ order: 1 }).lean();
    const tree = [];

    for (const unit of units) {
      const topics = await Topic.find({ unitId: unit._id })
        .sort({ order: 1 })
        .lean();

      const topicList = [];

      for (const topic of topics) {
        const subtopics = await Subtopic.find({ topicId: topic._id })
          .sort({ order: 1 })
          .lean();

        const subtopicList = [];

        for (const st of subtopics) {
          const qCount = await Question.countDocuments({ subtopicId: st._id });

          subtopicList.push({
            id: st._id,
            name: st.name,
            nameHindi: st.nameHindi,
            order: st.order,
            totalQuestions: qCount,
            isLocked: st.isLocked,
          });
        }

        topicList.push({
          id: topic._id,
          name: topic.name,
          nameHindi: topic.nameHindi,
          description: topic.description,
          order: topic.order,
          totalSubtopics: subtopics.length,
          subtopics: subtopicList,
        });
      }

      tree.push({
        id: unit._id,
        name: unit.name,
        nameHindi: unit.nameHindi,
        description: unit.description,
        order: unit.order,
        totalTopics: topics.length,
        topics: topicList,
      });
    }

    res.json(tree);
  } catch (err) {
    console.error("Syllabus Tree Error:", err);
    res.status(500).json({ message: "Failed to load syllabus" });
  }
};
