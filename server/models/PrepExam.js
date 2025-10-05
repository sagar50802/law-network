import mongoose from "mongoose";
const ExamSchema = new mongoose.Schema(
  {
    examId: { type: String, unique: true, index: true },
    name: { type: String, required: true },
    scheduleMode: { type: String, default: "cohort" }, // only cohort now
  },
  { timestamps: true }
);
export default mongoose.models.PrepExam || mongoose.model("PrepExam", ExamSchema);
