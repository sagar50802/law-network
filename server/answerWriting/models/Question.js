import mongoose from "mongoose";

const questionSchema = new mongoose.Schema(
  {
    examId: { type: mongoose.Schema.Types.ObjectId, ref: "Exam", required: true },
    topicId: { type: mongoose.Schema.Types.ObjectId, ref: "Topic" },
    subtopicId: { type: mongoose.Schema.Types.ObjectId, ref: "Subtopic" },

    questionHindi: { type: String, required: true },
    questionEnglish: { type: String, required: true },

    answerHindi: { type: String, required: true },
    answerEnglish: { type: String, required: true },

    releaseTime: { type: Date, required: true },
  },
  { timestamps: true }
);

export default mongoose.models.Question || mongoose.model("Question", questionSchema);
