 import Unit from "../models/Unit.js";
import Exam from "../models/Exam.js";

export const createUnit = async (req, res) => {
  try {
    const { name } = req.body;

    const unit = await Unit.create({
      name,
      exam: req.params.examId,
      topics: [],
    });

    await Exam.findByIdAndUpdate(req.params.examId, {
      $push: { units: unit._id },
    });

    res.json({ success: true, unit });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const updateUnit = async (req, res) => {
  try {
    const unit = await Unit.findByIdAndUpdate(
      req.params.unitId,
      { name: req.body.name },
      { new: true }
    );

    res.json({ success: true, unit });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

export const deleteUnit = async (req, res) => {
  try {
    await Unit.findByIdAndDelete(req.params.unitId);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
