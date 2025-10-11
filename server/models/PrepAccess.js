// models/PrepAccess.js
import mongoose from "mongoose";

const PrepAccessSchema = new mongoose.Schema(
  {
    userEmail: { type: String, index: true, required: true },
    examId:    { type: String, index: true, required: true },

    startAt:   { type: Date, required: true },
    planDays:  { type: Number, default: 30 },

    // Optional in our flows (don’t force an expiry)
    expiryAt:  { type: Date },

    // Must match the routes: "trial" | "active" | "revoked"
    status:    { type: String, enum: ["trial", "active", "revoked"], default: "trial", index: true },

    // Used by restart/overlay logic
    cycle:       { type: Number, default: 0 },
    overlayForce:{ type: Boolean, default: false },
    forceMode:   { type: String },
  },
  { timestamps: true }
);

PrepAccessSchema.index({ userEmail: 1, examId: 1 });

export default mongoose.models.PrepAccess ||
  mongoose.model("PrepAccess", PrepAccessSchema);
