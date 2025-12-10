const mongoose = require("mongoose");

const TopicSchema = new mongoose.Schema({
  unitId: { type: mongoose.Schema.Types.ObjectId, ref: "QnaUnit", required: true },
  name: { type: String, required: true },
  order: Number
});

module.exports = mongoose.model("QnaTopic", TopicSchema);
