const Topic = require("../models/Topic");

exports.createTopic = async (req, res) => {
  try {
    const topic = await Topic.create({
      unitId: req.params.unitId,
      name: req.body.name,
    });
    res.json(topic);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.toggleLock = async (req, res) => {
  try {
    const topic = await Topic.findByIdAndUpdate(
      req.params.topicId,
      { locked: req.body.locked },
      { new: true }
    );
    res.json(topic);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
