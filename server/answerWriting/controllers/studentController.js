import Question from "../models/Question.js";
import Unit from "../models/Unit.js";
import Topic from "../models/Topic.js";
import Subtopic from "../models/Subtopic.js";

const studentController = {
  async getDashboard(req, res) {
    try {
      const examId = req.params.examId;

      // Fetch released questions
      const released = await Question.find({
        examId,
        isReleased: true,
      });

      res.json({
        success: true,
        progress: {
          total: released.length,
        },
      });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  async getLiveQuestion(req, res) {
    try {
      const now = new Date();
      const examId = req.params.examId;

      const q = await Question.findOne({
        examId,
        isReleased: true,
      })
        .sort({ releaseAt: -1 })
        .limit(1);

      res.json({ success: true, question: q || null });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
};

export default studentController;
