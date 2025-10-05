import mongoose from "mongoose";

const FileSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ["image", "pdf", "audio", "video"], required: true },
    url: { type: String, required: true },
    mime: { type: String, default: "" },
  },
  { _id: false }
);

const FlagsSchema = new mongoose.Schema(
  {
    extractOCR: { type: Boolean, default: false },
    showOriginal: { type: Boolean, default: false },
    allowDownload: { type: Boolean, default: false },
    highlight: { type: Boolean, default: false },
    background: { type: String, default: "" },
  },
  { _id: false }
);

const PrepModuleSchema = new mongoose.Schema(
  {
    examId: { type: String, index: true, required: true },
    dayIndex: { type: Number, index: true, required: true }, // 1..N (cohort)
    slotMin: { type: Number, default: 0 }, // minutes from midnight (0..1439)
    title: { type: String, default: "" },
    description: { type: String, default: "" },

    files: [FileSchema],
    ocrText: { type: String, default: "" },
    flags: { type: FlagsSchema, default: () => ({}) },

    status: { type: String, enum: ["draft", "scheduled", "released"], default: "released" }, // cohort doesn’t need schedule, keep 'released'
  },
  { timestamps: true }
);

PrepModuleSchema.index({ examId: 1, dayIndex: 1, slotMin: 1 });

export default mongoose.models.PrepModule || mongoose.model("PrepModule", PrepModuleSchema);
