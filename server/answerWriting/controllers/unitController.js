// server/answerWriting/controllers/unitController.js
import Unit from "../models/Unit.js";

const unitController = {
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
};

export default unitController;
