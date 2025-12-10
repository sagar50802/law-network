const mongoose = require("mongoose");

const SubtopicSchema = new mongoose.Schema({
  topicId: { type: mongoose.Schema.Types.ObjectId, ref: "QnaTopic", required: true },
  name: { type: String, required: true },
  order: Number
});

module.exports = mongoose.model("QnaSubtopic", SubtopicSchema);
