import mongoose from "mongoose";

const ExamSchema = new mongoose.Schema({
  examId: { type: String, unique: true, required: true },   // e.g. "UP_APO"
  name:   { type: String, required: true },                 // "UP APO"
  scheduleMode: { type: String, default: "cohort" },        // keep simple
}, { timestamps: true });

export default mongoose.models.Exam || mongoose.model("Exam", ExamSchema);
