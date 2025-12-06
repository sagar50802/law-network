import mongoose from "mongoose";

const SubtopicSchema = new mongoose.Schema(
  {
    topicId: { type: mongoose.Schema.Types.ObjectId, ref: "AnswerWritingTopic", required: true },
    name: String,
  },
  { timestamps: true }
);

const Subtopic = mongoose.model("AnswerWritingSubtopic", SubtopicSchema);
export default Subtopic;
