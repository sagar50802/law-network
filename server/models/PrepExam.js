// server/models/PrepExam.js
import mongoose from "mongoose";

const ExamSchema = new mongoose.Schema(
  {
    examId: { type: String, unique: true, index: true },
    name: { type: String, required: true },
    scheduleMode: { type: String, default: "cohort" }, // only cohort now

    // --- Existing optional fields (non-breaking) ---
    price: { type: Number, default: 0 }, // e.g., ₹499
    autoGrantRestart: { type: Boolean, default: false }, // owner toggle
    trialDays: { type: Number, default: 3 }, // free trial days before payment

    // --- NEW: overlay trigger configuration (admin-controlled) ---
    overlay: {
      mode: {
        type: String,
        enum: ["never", "offset-days", "fixed-date"],
        default: "offset-days",
      },
      offsetDays: { type: Number, default: 3 }, // used when mode = offset-days
      fixedAt: { type: Date, default: null },   // used when mode = fixed-date
    },
    // --------------------------------------------------------------
  },
  { timestamps: true }
);

// Use existing model if already compiled (for hot reload safety)
export default mongoose.models.PrepExam || mongoose.model("PrepExam", ExamSchema);
