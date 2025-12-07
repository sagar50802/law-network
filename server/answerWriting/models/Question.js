import mongoose from "mongoose";

const QuestionSchema = new mongoose.Schema(
  {
    topic: { type: mongoose.Schema.Types.ObjectId, ref: "Topic" },
    subtopic: { type: mongoose.Schema.Types.ObjectId, ref: "Subtopic" },

    questionHindi: String,
    questionEnglish: String,
    answerHindi: String,
    answerEnglish: String,

    releaseDate: Date,
    released: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.models.Question || mongoose.model("Question", QuestionSchema);
