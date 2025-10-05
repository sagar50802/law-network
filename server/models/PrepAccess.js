import mongoose from "mongoose";

const PrepAccessSchema = new mongoose.Schema(
  {
    userEmail: { type: String, index: true, required: true },
    examId: { type: String, index: true, required: true },
    startAt: { type: Date, required: true },
    planDays: { type: Number, default: 30 },
    expiryAt: { type: Date, required: true },
    status: { type: String, enum: ["active", "archived"], default: "active" },
  },
  { timestamps: true }
);

PrepAccessSchema.index({ userEmail: 1, examId: 1, status: 1 });

export default mongoose.models.PrepAccess || mongoose.model("PrepAccess", PrepAccessSchema);
