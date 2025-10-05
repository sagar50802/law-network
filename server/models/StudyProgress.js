import mongoose from "mongoose";

const StudyProgressSchema = new mongoose.Schema({
  userEmail:     { type: String, index: true, required: true },
  examId:        { type: String, index: true, required: true },
  completedDays: { type: [Number], default: [] },
}, { timestamps: true });

StudyProgressSchema.index({ userEmail:1, examId:1 }, { unique: true });

export default mongoose.models.StudyProgress ||
  mongoose.model("StudyProgress", StudyProgressSchema);
