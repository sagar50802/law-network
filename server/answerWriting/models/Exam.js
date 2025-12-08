// server/answerWriting/models/Exam.js
import mongoose from "mongoose";

const { Schema } = mongoose;

const ExamSchema = new Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// IMPORTANT: use unique model name AND guard with mongoose.models
const Exam =
  mongoose.models.AnswerWritingExam ||
  mongoose.model("AnswerWritingExam", ExamSchema);

export default Exam;
