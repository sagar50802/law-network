import Topic from "../models/Topic.js";
import Subtopic from "../models/Subtopic.js";
import Question from "../models/Question.js";

export async function createTopic(req, res) {
  try {
    const topic = await Topic.create({
      unitId: req.params.unitId,
      name: req.body.name
    });

    res.json({ success: true, topic });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function toggleLock(req, res) {
  try {
    const updated = await Topic.findByIdAndUpdate(
      req.params.topicId,
      { locked: req.body.locked },
      { new: true }
    );

    res.json({ success: true, topic: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function deleteTopic(req, res) {
  try {
    const { topicId } = req.params;

    const subs = await Subtopic.find({ topicId });
    for (const s of subs) {
      await Question.deleteMany({ subtopicId: s._id });
    }

    await Subtopic.deleteMany({ topicId });
    await Topic.findByIdAndDelete(topicId);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function updateTopic(req, res) {
  try {
    const updated = await Topic.findByIdAndUpdate(req.params.topicId, req.body, { new: true });

    res.json({ success: true, topic: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}
