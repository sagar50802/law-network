const mongoose = require("mongoose");

const QuestionSchema = new mongoose.Schema({
  subtopicId: { type: mongoose.Schema.Types.ObjectId, ref: "QnaSubtopic", required: true },

  questionText: { type: String, required: true },
  answerText: { type: String, required: true },

  releaseAt: { type: Date, required: true },
  order: Number,

  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("QnaQuestion", QuestionSchema);
