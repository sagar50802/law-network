import mongoose from "mongoose";

const questionSchema = new mongoose.Schema(
  {
    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AnswerWritingExam",
      required: true,
    },
    unitId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AnswerWritingUnit",
      required: true,
    },
    topicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AnswerWritingTopic",
      required: true,
    },
    subtopicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AnswerWritingSubtopic",
      required: true,
    },

    // Question text
    hindiText: { type: String, default: "" },
    englishText: { type: String, default: "" },

    // Answer text (for “tap to show answer”)
    hindiAnswer: { type: String, default: "" },
    englishAnswer: { type: String, default: "" },

    releaseAt: { type: Date, required: true },
    isReleased: { type: Boolean, default: false },
  },
  {
    timestamps: true,
    collection: "answer_writing_questions",
  }
);

export default (
  mongoose.models.AnswerWritingQuestion ||
  mongoose.model("AnswerWritingQuestion", questionSchema)
);
