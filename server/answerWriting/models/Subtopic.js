import mongoose from "mongoose";

const subtopicSchema = new mongoose.Schema(
  {
    topicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AnswerWritingTopic",
      required: true,
    },
    name: { type: String, required: true },
  },
  {
    timestamps: true,
    collection: "answer_writing_subtopics",
  }
);

export default (
  mongoose.models.AnswerWritingSubtopic ||
  mongoose.model("AnswerWritingSubtopic", subtopicSchema)
);
