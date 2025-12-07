import mongoose from "mongoose";

const TopicSchema = new mongoose.Schema(
  {
    unitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Unit",
      required: true,
    },
    name: { type: String, required: true },
    locked: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    collection: "answer_writing_topics",
  }
);

export default mongoose.models.Topic ||
  mongoose.model("Topic", TopicSchema);
