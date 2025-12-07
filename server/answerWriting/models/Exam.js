import mongoose from "mongoose";

const examSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
  },
  {
    timestamps: true,
    collection: "answer_writing_exams",
  }
);

// model name is unique → no clash with other Exam models
export default (
  mongoose.models.AnswerWritingExam ||
  mongoose.model("AnswerWritingExam", examSchema)
);
