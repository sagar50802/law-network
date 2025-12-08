import mongoose from "mongoose";

const questionSchema = new mongoose.Schema(
  {
    questionHindi: { type: String, required: true },
    questionEnglish: { type: String, required: true },

    answerHindi: { type: String, required: true },
    answerEnglish: { type: String, required: true },

    releaseAt: { type: Date, required: true },

    exam: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Exam",
      required: true,
    },

    unit: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Unit",
      required: true,
    },

    topic: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Topic",
      required: true,
    },

    subtopic: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subtopic",
      required: true,
    },
  },
  { timestamps: true }
);

export default mongoose.models.Question || mongoose.model("Question", questionSchema);
