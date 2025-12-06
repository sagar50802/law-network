import mongoose from "mongoose";

const QuestionSchema = new mongoose.Schema(
  {
    subtopicId: { type: mongoose.Schema.Types.ObjectId, ref: "AnswerWritingSubtopic", required: true },
    hindiText: String,
    englishText: String,
    releaseAt: Date,
    isReleased: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const Question = mongoose.model("AnswerWritingQuestion", QuestionSchema);
export default Question;
