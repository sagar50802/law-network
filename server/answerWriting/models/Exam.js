import mongoose from "mongoose";

const ExamSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
  },
  { timestamps: true }
);

// Prevent OverwriteModelError
export default mongoose.models.Exam || mongoose.model("Exam", ExamSchema);
