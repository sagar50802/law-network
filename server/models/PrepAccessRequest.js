// models/PrepAccessRequest.js
import mongoose from "mongoose";

const PrepAccessRequestSchema = new mongoose.Schema(
  {
    examId:       { type: String, required: true, index: true },
    userEmail:    { type: String, required: true, index: true },
    intent:       { type: String, enum: ["purchase", "restart"], required: true },
    screenshotUrl:{ type: String },
    note:         { type: String },
    status:       { type: String, enum: ["pending", "approved", "rejected"], default: "pending", index: true },
    priceAt:      { type: Number },
    approvedAt:   { type: Date },
    approvedBy:   { type: String },
  },
  { timestamps: true }
);

export default mongoose.models.PrepAccessRequest ||
  mongoose.model("PrepAccessRequest", PrepAccessRequestSchema);
