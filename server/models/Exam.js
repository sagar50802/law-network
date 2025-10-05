// server/models/Exam.js
import mongoose from "mongoose";
const ExamSchema = new mongoose.Schema({
  examId:       { type: String, unique: true, required: true },
  name:         { type: String, required: true },
  scheduleMode: { type: String, enum: ["cohort"], default: "cohort" },
}, { timestamps: true });

export default mongoose.models.Exam || mongoose.model("Exam", ExamSchema);
