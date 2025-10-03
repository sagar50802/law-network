import mongoose from "mongoose";

const ExamProgressSchema = new mongoose.Schema({
  email: { type: String, required: true },
  examName: { type: String, required: true },
  moduleId: { type: mongoose.Schema.Types.ObjectId, ref: "ExamModule", required: true },
  done: { type: Boolean, default: false },
  completedAt: { type: Date }
});
ExamProgressSchema.index({ email: 1, moduleId: 1 }, { unique: true });
export default mongoose.model("ExamProgress", ExamProgressSchema);
