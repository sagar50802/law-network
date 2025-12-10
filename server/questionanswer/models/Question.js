// server/questionanswer/models/Question.js
import mongoose from "mongoose";

const QuestionSchema = new mongoose.Schema({
  examId: { type: mongoose.Schema.Types.ObjectId, ref: "QnaExam" }, // CHANGED from "Exam" to "QnaExam"
  unitId: { type: mongoose.Schema.Types.ObjectId, ref: "Unit" },
  topicId: { type: mongoose.Schema.Types.ObjectId, ref: "Topic" },
  subtopicId: { type: mongoose.Schema.Types.ObjectId, ref: "Subtopic" },

  order: { type: Number, default: 1 },

  questionHindi: String,
  questionEnglish: String,
  answerHindi: String,
  answerEnglish: String,

  keywords: [String],
  caseLaws: [String],

  difficulty: { type: String, enum: ["easy", "medium", "hard"], default: "medium" },

  isPremium: { type: Boolean, default: false },
  scheduledRelease: { type: Date, default: null },
  isReleased: { type: Boolean, default: true },

  views: { type: Number, default: 0 },
  completionCount: { type: Number, default: 0 },
  averageTimeSpent: { type: Number, default: 0 },

  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Question", QuestionSchema);
