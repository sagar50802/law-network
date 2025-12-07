// server/answerWriting/controllers/questionController.js
import Question from "../models/Question.js";
import Subtopic from "../models/Subtopic.js";
import Topic from "../models/Topic.js";
import Unit from "../models/Unit.js";

export async function createQuestion(req, res) {
  try {
    const { subtopicId } = req.params;
    const { hindiText, englishText, releaseAt } = req.body;

    const subtopic = await Subtopic.findById(subtopicId);
    if (!subtopic) {
      return res
        .status(404)
        .json({ success: false, message: "Subtopic not found" });
    }

    const topic = await Topic.findById(subtopic.topicId);
    const unit = topic ? await Unit.findById(topic.unitId) : null;

    const question = await Question.create({
      subtopicId: subtopic._id,
      topicId: topic?._id,
      unitId: unit?._id,
      examId: unit?.examId,
      hindiText,
      englishText,
      releaseAt,
      isReleased: false,
    });

    res.json({ success: true, question });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function deleteQuestion(req, res) {
  try {
    await Question.findByIdAndDelete(req.params.questionId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}
