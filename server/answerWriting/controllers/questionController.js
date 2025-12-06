import Question from "../models/Question.js";

const questionController = {
  async createQuestion(req, res) {
    try {
      const q = await Question.create({
        subtopicId: req.params.subtopicId,
        hindiText: req.body.hindiText,
        englishText: req.body.englishText,
        releaseAt: req.body.releaseAt,
        isReleased: false,
      });

      res.json({ success: true, question: q });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },

  async deleteQuestion(req, res) {
    try {
      await Question.findByIdAndDelete(req.params.questionId);
      res.json({ success: true });
    } catch (err) {
      res.status(500).json({ success: false, message: err.message });
    }
  },
};

export default questionController;
