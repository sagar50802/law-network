import Topic from "../models/Topic.js";

const topicController = {
  async createTopic(req, res) {
    try {
      const topic = await Topic.create({
        unitId: req.params.unitId,
        name: req.body.name,
      });

      res.json({ success: true, topic });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  async toggleLock(req, res) {
    try {
      const topicId = req.params.topicId;
      const { locked } = req.body;

      const topic = await Topic.findByIdAndUpdate(
        topicId,
        { locked },
        { new: true }
      );

      res.json({ success: true, topic });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
};

export default topicController;
