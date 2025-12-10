const mongoose = require("mongoose");

const ExamSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  isLocked: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("QnaExam", ExamSchema);
