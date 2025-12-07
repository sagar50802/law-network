import mongoose from "mongoose";

const SubtopicSchema = new mongoose.Schema(
  {
    topicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Topic",
      required: true,
    },
    name: { type: String, required: true },
  },
  {
    timestamps: true,
    collection: "answer_writing_subtopics",
  }
);

export default mongoose.models.Subtopic ||
  mongoose.model("Subtopic", SubtopicSchema);
