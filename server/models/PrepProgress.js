import mongoose from "mongoose";
const PrepProgressSchema = new mongoose.Schema(
  {
    userEmail: { type: String, index: true, required: true },
    examId: { type: String, index: true, required: true },
    completedDays: { type: [Number], default: [] }, // [1,2,3]
  },
  { timestamps: true }
);
PrepProgressSchema.index({ userEmail: 1, examId: 1 }, { unique: true });
export default mongoose.models.PrepProgress || mongoose.model("PrepProgress", PrepProgressSchema);
