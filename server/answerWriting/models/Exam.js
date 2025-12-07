import mongoose from "mongoose";

const ExamSchema = new mongoose.Schema({
  name: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

// FIX ⬇️ Prevent model overwrite error
export default mongoose.models.Exam || mongoose.model("Exam", ExamSchema);
