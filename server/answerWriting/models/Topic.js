import mongoose from "mongoose";

const topicSchema = new mongoose.Schema(
  {
    unitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AnswerWritingUnit",
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

export default (
  mongoose.models.AnswerWritingTopic ||
  mongoose.model("AnswerWritingTopic", topicSchema)
);
