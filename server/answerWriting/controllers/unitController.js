const Unit = require("../models/Unit");

exports.createUnit = async (req, res) => {
  try {
    const unit = await Unit.create({
      examId: req.params.examId,
      name: req.body.name,
    });
    res.json(unit);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};
