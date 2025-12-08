import Unit from "../models/Unit.js";
import Exam from "../models/Exam.js";

export const createUnit = async (req, res) => {
  try {
    const { name } = req.body;
    const unit = await Unit.create({ name, exam: req.params.examId });

    await Exam.findByIdAndUpdate(req.params.examId, { $push: { units: unit._id } });

    res.json({ success: true, unit });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
