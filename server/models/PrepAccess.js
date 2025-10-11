// models/PrepAccess.js
import mongoose from "mongoose";

const PrepAccessSchema = new mongoose.Schema(
  {
    userEmail: { type: String, index: true, required: true },
    examId:    { type: String, index: true, required: true },

    // when the current access cycle started
    startAt:   { type: Date, required: true },

    // how many days the plan runs for (used to compute todayDay + restarts)
    planDays:  { type: Number, default: 30 },

    // optional – some installs don't use a hard expiry
    expiryAt:  { type: Date },

    // the routes expect: "trial" | "active" | "revoked"
    status:    { type: String, enum: ["trial", "active", "revoked"], default: "trial", index: true },

    // optional extras used by the overlay/status logic
    cycle:       { type: Number, default: 0 },       // increments on restart
    overlayForce:{ type: Boolean, default: false },
    forceMode:   { type: String },                   // e.g., "purchase"
  },
  { timestamps: true }
);

// quick lookups per user/exam; allow multiple rows across cycles
PrepAccessSchema.index({ userEmail: 1, examId: 1 });

export default mongoose.models.PrepAccess ||
  mongoose.model("PrepAccess", PrepAccessSchema);
