const Subtopic = require("../models/Subtopic");

exports.createSubtopic = async (req, res) => {
  try {
    const subtopic = await Subtopic.create({
      topicId: req.params.topicId,
      name: req.body.name,
    });
    res.json(subtopic);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
