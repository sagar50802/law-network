// server/answerWriting/models/Topic.js
import mongoose from "mongoose";

const topicSchema = new mongoose.Schema(
  {
    unitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Unit",
      required: true,
    },
    name: { type: String, required: true },
    locked: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// SAFE EXPORT
export default mongoose.models.Topic || mongoose.model("Topic", topicSchema);
