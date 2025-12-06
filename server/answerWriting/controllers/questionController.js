const Question = require("../models/Question");
const Subtopic = require("../models/Subtopic");
const Topic = require("../models/Topic");
const Unit = require("../models/Unit");

exports.createQuestion = async (req, res) => {
  try {
    const sub = await Subtopic.findById(req.params.subtopicId);
    const topic = await Topic.findById(sub.topicId);
    const unit = await Unit.findById(topic.unitId);

    const question = await Question.create({
      subtopicId: sub._id,
      topicId: topic._id,
      unitId: unit._id,
      examId: unit.examId,

      hindiText: req.body.hindiText,
      englishText: req.body.englishText,

      releaseAt: req.body.releaseAt,
    });

    res.json(question);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.deleteQuestion = async (req, res) => {
  try {
    await Question.findByIdAndDelete(req.params.questionId);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
