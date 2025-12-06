// server/answerWriting/controllers/topicController.js

import Topic from "../models/Topic.js";
import Subtopic from "../models/Subtopic.js";
import Question from "../models/Question.js";

const topicController = {
  /* ------------------------------------------------------
     CREATE TOPIC
  ------------------------------------------------------ */
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

  /* ------------------------------------------------------
     UPDATE TOPIC
  ------------------------------------------------------ */
  async updateTopic(req, res) {
    try {
      const updated = await Topic.findByIdAndUpdate(
        req.params.topicId,
        { name: req.body.name },
        { new: true }
      );

      if (!updated)
        return res
          .status(404)
          .json({ success: false, message: "Topic not found" });

      res.json({ success: true, topic: updated });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  /* ------------------------------------------------------
     DELETE TOPIC + CASCADE DELETE (Subtopics + Questions)
  ------------------------------------------------------ */
  async deleteTopic(req, res) {
    try {
      const { topicId } = req.params;

      const subs = await Subtopic.find({ topicId });

      for (const s of subs) {
        await Question.deleteMany({ subtopicId: s._id });
      }

      await Subtopic.deleteMany({ topicId });
      await Topic.findByIdAndDelete(topicId);

      res.json({ success: true, message: "Topic deleted successfully" });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
};

export default topicController;
