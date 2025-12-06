// server/answerWriting/controllers/unitController.js

import Unit from "../models/Unit.js";
import Topic from "../models/Topic.js";
import Subtopic from "../models/Subtopic.js";
import Question from "../models/Question.js";

const unitController = {
  /* ------------------------------------------------------
     CREATE UNIT
  ------------------------------------------------------ */
  async createUnit(req, res) {
    try {
      const unit = await Unit.create({
        examId: req.params.examId,
        name: req.body.name,
      });

      res.json({ success: true, unit });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  /* ------------------------------------------------------
     UPDATE UNIT NAME
  ------------------------------------------------------ */
  async updateUnit(req, res) {
    try {
      const updated = await Unit.findByIdAndUpdate(
        req.params.unitId,
        { name: req.body.name },
        { new: true }
      );

      if (!updated)
        return res
          .status(404)
          .json({ success: false, message: "Unit not found" });

      res.json({ success: true, unit: updated });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  /* ------------------------------------------------------
     DELETE UNIT + CASCADE DELETE (Topics → Subtopics → Questions)
  ------------------------------------------------------ */
  async deleteUnit(req, res) {
    try {
      const { unitId } = req.params;

      // Find Topics under this Unit
      const topics = await Topic.find({ unitId });

      for (const t of topics) {
        const subs = await Subtopic.find({ topicId: t._id });

        // Delete all Questions under each Subtopic
        for (const s of subs) {
          await Question.deleteMany({ subtopicId: s._id });
        }

        // Delete Subtopics
        await Subtopic.deleteMany({ topicId: t._id });
      }

      // Delete Topics under Unit
      await Topic.deleteMany({ unitId });

      // Finally delete the Unit
      await Unit.findByIdAndDelete(unitId);

      res.json({ success: true, message: "Unit deleted successfully" });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  }
};

export default unitController;
