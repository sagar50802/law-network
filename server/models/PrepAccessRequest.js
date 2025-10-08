// Minimal request object for purchase/restart approval
import mongoose from "mongoose";

const PrepAccessRequestSchema = new mongoose.Schema(
  {
    examId: { type: String, required: true, index: true },
    userEmail: { type: String, required: true, index: true },
    intent: { type: String, enum: ["purchase", "restart"], required: true },
    screenshotUrl: { type: String },     // R2/GridFS url
    note: { type: String },
    status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },
    priceAt: { type: Number },           // price shown to user at time of request
    approvedAt: { type: Date },
    approvedBy: { type: String },        // admin email or id
  },
  { timestamps: true }
);

export default mongoose.model("PrepAccessRequest", PrepAccessRequestSchema);
