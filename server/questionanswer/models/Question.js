import mongoose from "mongoose";

const QuestionSchema = new mongoose.Schema({
  examId: { type: mongoose.Schema.Types.ObjectId, ref: "Exam" },
  topicId: { type: mongoose.Schema.Types.ObjectId, ref: "Topic" },
  text: { type: String, required: true },

  isLocked: { type: Boolean, default: false },
  isPremium: { type: Boolean, default: false },
  scheduledRelease: { type: Date, default: null },

  difficulty: { type: String, enum: ["easy", "medium", "hard"], default: "medium" },
  views: { type: Number, default: 0 },

  createdAt: { type: Date, default: Date.now },
});

const Question = mongoose.model("Question", QuestionSchema);

export default Question;
