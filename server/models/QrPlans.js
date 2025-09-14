import mongoose from "mongoose";

const QrPlansSchema = new mongoose.Schema(
  {
    weekly: { type: String, default: "" },
    monthly: { type: String, default: "" },
    yearly: { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.model("QrPlans", QrPlansSchema);
