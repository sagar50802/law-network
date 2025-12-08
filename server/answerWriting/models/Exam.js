import mongoose from "mongoose";

const ExamSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true }
);

//  IMPORTANT: Prevent OverwriteModelError on Render
export default mongoose.models.AnswerWritingExam ||
  mongoose.model("AnswerWritingExam", ExamSchema);
