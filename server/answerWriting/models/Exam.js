// server/answerWriting/models/Exam.js
import mongoose from "mongoose";

const examSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
  },
  {
    timestamps: true,
    collection: "answer_writing_exams", // optional but nice & clear
  }
);

// IMPORTANT: use a NEW model name so it doesn't clash with your old "Exam"
export default (
  mongoose.models.AnswerWritingExam ||
  mongoose.model("AnswerWritingExam", examSchema)
);
