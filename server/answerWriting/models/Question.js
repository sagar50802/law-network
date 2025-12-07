// server/answerWriting/models/Question.js
import mongoose from "mongoose";

const questionSchema = new mongoose.Schema(
  {
    examId: { type: mongoose.Schema.Types.ObjectId, ref: "Exam" },
    unitId: { type: mongoose.Schema.Types.ObjectId, ref: "Unit" },
    topicId: { type: mongoose.Schema.Types.ObjectId, ref: "Topic" },
    subtopicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subtopic",
      required: true,
    },

    hindiText: { type: String },
    englishText: { type: String },

    releaseAt: { type: Date, required: true },
    isReleased: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.models.Question || mongoose.model("Question", questionSchema);
