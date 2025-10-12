// models/PrepExam.js
import mongoose from "mongoose";

const PaymentSchema = new mongoose.Schema(
  {
    upiId: String,
    upiName: String,
    whatsappNumber: String,
    whatsappText: String,
  },
  { _id: false, strict: false }            // allow extra keys if needed
);

const OverlaySchema = new mongoose.Schema(
  {
    mode: String,               // "offset-days" | "fixed-date" | "planDayTime" | "never"
    offsetDays: Number,
    fixedAt: Date,
    showOnDay: Number,
    showAtLocal: String,
    tz: String,

    // ✅ KEY PART: keep payment inside overlay
    payment: { type: PaymentSchema, default: {} },

    // legacy fields (harmless to keep)
    overlayMode: String,
    daysAfterStart: Number,
  },
  { _id: false, strict: false }            // don't drop unknowns
);

const PrepExamSchema = new mongoose.Schema(
  {
    examId:   { type: String, index: true, unique: true, required: true },
    name:     { type: String, required: true },

    price:    { type: Number, default: 0 },
    trialDays:{ type: Number, default: 3 },

    overlay:  { type: OverlaySchema, default: {} },

    // ✅ optional mirror for older code
    payment:  { type: PaymentSchema, default: {} },

    // anything else the app might stash
    overlayUI: { type: mongoose.Schema.Types.Mixed, default: {} },
    scheduleMode: { type: String, default: "cohort" },
  },
  { timestamps: true, strict: false }      // be forgiving at the root
);

export default mongoose.models.PrepExam ||
  mongoose.model("PrepExam", PrepExamSchema);
