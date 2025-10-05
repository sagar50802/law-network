// server/models/ExamAccess.js
import mongoose from "mongoose";
const ExamAccessSchema = new mongoose.Schema({
  userEmail: { type: String, index: true, required: true },
  examId:    { type: String, index: true, required: true },
  startAt:   { type: Date, required: true },
  planDays:  { type: Number, required: true }, // 7/30/90 etc
  expiryAt:  { type: Date, required: true },
  status:    { type: String, enum: ["active","archived"], default: "active" },
}, { timestamps: true });

ExamAccessSchema.index({ userEmail: 1, examId: 1, status: 1 });

export default mongoose.models.ExamAccess || mongoose.model("ExamAccess", ExamAccessSchema);
