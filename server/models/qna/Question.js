import mongoose from "mongoose";

const QuestionSchema = new mongoose.Schema(
  {
    subtopicId: { type: mongoose.Schema.Types.ObjectId, ref: "Subtopic", required: true },
    questionText: { type: String, required: true },
    answerText: { type: String, required: true },
    releaseAt: { type: Date, required: true },
    order: Number,
  },
  { timestamps: true }
);

export default mongoose.models.Question || mongoose.model("Question", QuestionSchema);
