const Question = require("../models/Question");
const Subtopic = require("../models/Subtopic");
const Topic = require("../models/Topic");
const Unit = require("../models/Unit");

exports.createQuestion = async (req, res) => {
  try {
    const { subtopicId } = req.params;
    const { hindiText, englishText, releaseAt } = req.body;

    if (!hindiText && !englishText) {
      return res.status(400).json({ message: "Question text is required" });
    }
    if (!releaseAt) {
      return res.status(400).json({ message: "releaseAt is required" });
    }

    const subtopic = await Subtopic.findById(subtopicId);
    if (!subtopic) {
      return res.status(404).json({ message: "Subtopic not found" });
    }

    const topic = await Topic.findById(subtopic.topicId);
    if (!topic) return res.status(404).json({ message: "Topic not found" });

    const unit = await Unit.findById(topic.unitId);
    if (!unit) return res.status(404).json({ message: "Unit not found" });

    const question = await Question.create({
      subtopicId: subtopic._id,
      hindiText,
      englishText,
      releaseAt: new Date(releaseAt),
      isReleased: false,
      topicId: topic._id,
      unitId: unit._id,
      examId: unit.examId,
    });

    res.status(201).json(question);
  } catch (err) {
    console.error("createQuestion error", err);
    res.status(500).json({ message: "Failed to create question" });
  }
};

exports.deleteQuestion = async (req, res) => {
  try {
    const { questionId } = req.params;
    const q = await Question.findByIdAndDelete(questionId);
    if (!q) return res.status(404).json({ message: "Question not found" });
    res.json({ success: true });
  } catch (err) {
    console.error("deleteQuestion error", err);
    res.status(500).json({ message: "Failed to delete question" });
  }
};
