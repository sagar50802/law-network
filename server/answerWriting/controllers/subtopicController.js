import Subtopic from "../models/Subtopic.js";
import Topic from "../models/Topic.js";

export const createSubtopic = async (req, res) => {
  try {
    const sub = await Subtopic.create({
      topic: req.params.topicId,
      name: req.body.name,
    });

    await Topic.findByIdAndUpdate(req.params.topicId, {
      $push: { subtopics: sub._id },
    });

    res.json({ success: true, subtopic: sub });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const updateSubtopic = async (req, res) => {
  try {
    const sub = await Subtopic.findByIdAndUpdate(
      req.params.subtopicId,
      { name: req.body.name },
      { new: true }
    );

    res.json({ success: true, subtopic: sub });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteSubtopic = async (req, res) => {
  try {
    await Subtopic.findByIdAndDelete(req.params.subtopicId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
