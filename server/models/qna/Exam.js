import mongoose from "mongoose";

const ExamSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: String,
    isLocked: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.models.Exam || mongoose.model("Exam", ExamSchema);
