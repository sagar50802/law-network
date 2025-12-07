import Unit from "../models/Unit.js";
import Topic from "../models/Topic.js";
import Subtopic from "../models/Subtopic.js";
import Question from "../models/Question.js";

export async function createUnit(req, res) {
  try {
    const unit = await Unit.create({
      examId: req.params.examId,
      name: req.body.name
    });

    res.json({ success: true, unit });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function deleteUnit(req, res) {
  try {
    const { unitId } = req.params;

    const topics = await Topic.find({ unitId });

    for (const t of topics) {
      const subs = await Subtopic.find({ topicId: t._id });
      for (const s of subs) {
        await Question.deleteMany({ subtopicId: s._id });
      }
      await Subtopic.deleteMany({ topicId: t._id });
    }

    await Topic.deleteMany({ unitId });
    await Unit.findByIdAndDelete(unitId);

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

export async function updateUnit(req, res) {
  try {
    const updated = await Unit.findByIdAndUpdate(req.params.unitId, req.body, { new: true });

    res.json({ success: true, unit: updated });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}
