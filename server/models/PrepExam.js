// server/models/PrepExam.js
import mongoose from "mongoose";

const ExamSchema = new mongoose.Schema(
  {
    examId: { type: String, unique: true, index: true },
    name: { type: String, required: true },
    scheduleMode: { type: String, default: "cohort" }, // only cohort now

    // --- Added optional fields (non-breaking) ---
    price: { type: Number, default: 0 }, // e.g., 499
    autoGrantRestart: { type: Boolean, default: false }, // owner toggle
    trialDays: { type: Number, default: 3 }, // free trial days before payment
    // ------------------------------------------------
  },
  { timestamps: true }
);

// Use existing model if already compiled (for hot reload safety)
export default mongoose.models.PrepExam || mongoose.model("PrepExam", ExamSchema);
