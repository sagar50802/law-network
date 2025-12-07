import mongoose from "mongoose";

const QuestionSchema = new mongoose.Schema(
  {
    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Exam",
      required: true,
    },
    unitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Unit",
      required: true,
    },
    topicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Topic",
      required: true,
    },
    subtopicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Subtopic",
      required: true,
    },

    // Question text
    hindiText: { type: String, default: "" },
    englishText: { type: String, default: "" },

    // Answers
    hindiAnswer: { type: String, default: "" },
    englishAnswer: { type: String, default: "" },

    // Scheduling
    releaseAt: { type: Date, required: true },
    isReleased: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    collection: "answer_writing_questions",
  }
);

export default mongoose.models.Question ||
  mongoose.model("Question", QuestionSchema);
