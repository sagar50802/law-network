const mongoose = require("mongoose");

const UnitSchema = new mongoose.Schema({
  examId: { type: mongoose.Schema.Types.ObjectId, ref: "QnaExam", required: true },
  name: { type: String, required: true },
  order: Number
});

module.exports = mongoose.model("QnaUnit", UnitSchema);
