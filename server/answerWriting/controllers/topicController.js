import Topic from "../models/Topic.js";
import Subtopic from "../models/Subtopic.js";
import Question from "../models/Question.js";

export const createTopic = async (req, res) => {
  try {
    const topic = await Topic.create({
      unitId: req.params.unitId,
      name: req.body.name,
    });

    res.json(topic);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const toggleLock = async (req, res) => {
  try {
    const updated = await Topic.findByIdAndUpdate(
      req.params.topicId,
      { locked: req.body.locked },
      { new: true }
    );

    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const deleteTopic = async (req, res) => {
  try {
    const { topicId } = req.params;

    const subs = await Subtopic.find({ topicId });

    for (const s of subs) {
      await Question.deleteMany({ subtopicId: s._id });
    }

    await Subtopic.deleteMany({ topicId });
    await Topic.findByIdAndDelete(topicId);

    res.json({ success: true, message: "Topic deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

export const updateTopic = async (req, res) => {
  try {
    const updated = await Topic.findByIdAndUpdate(
      req.params.topicId,
      req.body,
      { new: true }
    );

    res.json(updated);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
