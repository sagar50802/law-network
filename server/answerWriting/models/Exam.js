import mongoose from "mongoose";

const ExamSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
  },
  { timestamps: true }
);

const Exam = mongoose.model("AnswerWritingExam", ExamSchema);
export default Exam;
