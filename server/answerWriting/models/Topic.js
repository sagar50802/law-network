const mongoose = require("mongoose");

const topicSchema = new mongoose.Schema(
  {
    unitId: { type: mongoose.Schema.Types.ObjectId, ref: "Unit", required: true },
    name: { type: String, required: true },
    locked: { type: Boolean, default: false },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Topic", topicSchema);
