import mongoose from "mongoose";

const TopicSchema = new mongoose.Schema(
  {
    unitId: { type: mongoose.Schema.Types.ObjectId, ref: "AnswerWritingUnit", required: true },
    name: String,
    locked: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const Topic = mongoose.model("AnswerWritingTopic", TopicSchema);
export default Topic;
