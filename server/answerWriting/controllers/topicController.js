import Topic from "../models/Topic.js";
import Unit from "../models/Unit.js";
export const createTopic = async (req, res) => {
  try {
    const topic = await Topic.create({
      unit: req.params.unitId,
      name: req.body.name,
    });

    await Unit.findByIdAndUpdate(req.params.unitId, {
      $push: { topics: topic._id },
    });

    res.json({ success: true, topic });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const updateTopic = async (req, res) => {
  try {
    const topic = await Topic.findByIdAndUpdate(
      req.params.topicId,
      { name: req.body.name },
      { new: true }
    );

    res.json({ success: true, topic });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteTopic = async (req, res) => {
  try {
    await Topic.findByIdAndDelete(req.params.topicId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
