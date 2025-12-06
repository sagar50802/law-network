const Topic = require("../models/Topic");
const Unit = require("../models/Unit");

exports.createTopic = async (req, res) => {
  try {
    const { unitId } = req.params;
    const { name } = req.body;

    if (!name) return res.status(400).json({ message: "Name is required" });

    const unit = await Unit.findById(unitId);
    if (!unit) return res.status(404).json({ message: "Unit not found" });

    const topic = await Topic.create({
      unitId: unit._id,
      name,
      locked: false,
    });

    res.status(201).json(topic);
  } catch (err) {
    console.error("createTopic error", err);
    res.status(500).json({ message: "Failed to create topic" });
  }
};

exports.toggleLock = async (req, res) => {
  try {
    const { topicId } = req.params;
    const { locked } = req.body;

    const topic = await Topic.findById(topicId);
    if (!topic) return res.status(404).json({ message: "Topic not found" });

    topic.locked = !!locked;
    await topic.save();

    res.json(topic);
  } catch (err) {
    console.error("toggleLock error", err);
    res.status(500).json({ message: "Failed to toggle lock" });
  }
};
