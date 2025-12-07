// server/answerWriting/controllers/subtopicController.js
import Subtopic from "../models/Subtopic.js";
import Question from "../models/Question.js";

export async function createSubtopic(req, res) {
  try {
    const subtopic = await Subtopic.create({
      topicId: req.params.topicId,
      name: req.body.name,
    });

    res.json({ success: true, subtopic });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function deleteSubtopic(req, res) {
  try {
    const { subtopicId } = req.params;

    await Question.deleteMany({ subtopicId });
    await Subtopic.findByIdAndDelete(subtopicId);

    res.json({ success: true, message: "Subtopic deleted" });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function updateSubtopic(req, res) {
  try {
    const updated = await Subtopic.findByIdAndUpdate(
      req.params.subtopicId,
      req.body,
      { new: true }
    );

    res.json({ success: true, subtopic: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}
