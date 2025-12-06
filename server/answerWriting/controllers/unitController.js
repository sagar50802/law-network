const Unit = require("../models/Unit");
const { findExamByParam } = require("./examController");

exports.createUnit = async (req, res) => {
  try {
    const { examId } = req.params;
    const { name } = req.body;

    if (!name) return res.status(400).json({ message: "Name is required" });

    const exam = await findExamByParam(examId);
    if (!exam) return res.status(404).json({ message: "Exam not found" });

    const unit = await Unit.create({
      examId: exam._id,
      name,
      locked: false,
    });

    res.status(201).json(unit);
  } catch (err) {
    console.error("createUnit error", err);
    res.status(500).json({ message: "Failed to create unit" });
  }
};
