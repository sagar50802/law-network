// server/answerWriting/controllers/subtopicController.js

import Subtopic from "../models/Subtopic.js";
import Question from "../models/Question.js";

const subtopicController = {
  /* ------------------------------------------------------
     CREATE SUBTOPIC
  ------------------------------------------------------ */
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

  /* ------------------------------------------------------
     UPDATE SUBTOPIC
  ------------------------------------------------------ */
  async updateSubtopic(req, res) {
    try {
      const updated = await Subtopic.findByIdAndUpdate(
        req.params.subtopicId,
        { name: req.body.name },
        { new: true }
      );

      if (!updated)
        return res
          .status(404)
          .json({ success: false, message: "Subtopic not found" });

      res.json({ success: true, subtopic: updated });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  /* ------------------------------------------------------
     DELETE SUBTOPIC + CASCADE DELETE QUESTIONS
  ------------------------------------------------------ */
  async deleteSubtopic(req, res) {
    try {
      const { subtopicId } = req.params;

      // Remove all questions under this subtopic
      await Question.deleteMany({ subtopicId });

      // Remove the subtopic itself
      await Subtopic.findByIdAndDelete(subtopicId);

      res.json({ success: true, message: "Subtopic deleted successfully" });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
};

export default subtopicController;
