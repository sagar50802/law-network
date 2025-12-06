import Subtopic from "../models/Subtopic.js";
import Question from "../models/Question.js";

export const createSubtopic = async (req, res) => {
  try {
    const subtopic = await Subtopic.create({
      topicId: req.params.topicId,
      name: req.body.name,
    });

    res.json(subtopic);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const deleteSubtopic = async (req, res) => {
  try {
    const { subtopicId } = req.params;

    await Question.deleteMany({ subtopicId });
    await Subtopic.findByIdAndDelete(subtopicId);

    res.json({ success: true, message: "Subtopic deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const updateSubtopic = async (req, res) => {
  try {
    const updated = await Subtopic.findByIdAndUpdate(
      req.params.subtopicId,
      req.body,
      { new: true }
    );

    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
