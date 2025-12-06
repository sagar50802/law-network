import Subtopic from "../models/Subtopic.js";

const subtopicController = {
  async createSubtopic(req, res) {
    try {
      const sub = await Subtopic.create({
        topicId: req.params.topicId,
        name: req.body.name,
      });

      res.json({ success: true, subtopic: sub });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
};

export default subtopicController;
