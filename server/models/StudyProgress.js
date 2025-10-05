// server/models/StudyProgress.js
import mongoose from "mongoose";
const StudyProgressSchema = new mongoose.Schema({
  userEmail:     { type: String, required: true, index: true },
  examId:        { type: String, required: true, index: true },
  completedDays: { type: [Number], default: [] }, // [1,2,3...]
}, { timestamps: true });

StudyProgressSchema.index({ userEmail: 1, examId: 1 }, { unique: true });

export default mongoose.models.StudyProgress || mongoose.model("StudyProgress", StudyProgressSchema);
