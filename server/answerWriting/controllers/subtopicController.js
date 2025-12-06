const Subtopic = require("../models/Subtopic");
const Topic = require("../models/Topic");

exports.createSubtopic = async (req, res) => {
  try {
    const { topicId } = req.params;
    const { name } = req.body;

    if (!name) return res.status(400).json({ message: "Name is required" });

    const topic = await Topic.findById(topicId);
    if (!topic) return res.status(404).json({ message: "Topic not found" });

    const subtopic = await Subtopic.create({
      topicId: topic._id,
      name,
    });

    res.status(201).json(subtopic);
  } catch (err) {
    console.error("createSubtopic error", err);
    res.status(500).json({ message: "Failed to create subtopic" });
  }
};
