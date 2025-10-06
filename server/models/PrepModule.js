// server/models/PrepModule.js
import mongoose from "mongoose";

const FileSchema = new mongoose.Schema(
  {
    kind: { type: String, enum: ["image", "pdf", "audio", "video", "other"], default: "other" },
    url: String,
    mime: String,
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
    // optional: run OCR only when it actually releases
    deferOCRUntilRelease: { type: Boolean, default: false },
  },
  { _id: false }
);

const PrepModuleSchema = new mongoose.Schema(
  {
    examId: { type: String, index: true },
    dayIndex: { type: Number, required: true },
    slotMin: { type: Number, default: 0 }, // for ordering within the day
    title: { type: String, default: "" },
    description: { type: String, default: "" },

    // NEW: manual text admin pastes (shown to users first if non-empty)
    text: { type: String, default: "" },

    // OCR text (filled only when Extract OCR is true and we process a file)
    ocrText: { type: String, default: "" },

    files: [FileSchema],
    flags: FlagsSchema,

    // NEW: schedule
    releaseAt: { type: Date },                    // optional (UTC)
    status: { type: String, enum: ["released", "scheduled", "draft"], default: "released" },
  },
  { timestamps: true }
);

export default mongoose.model("PrepModule", PrepModuleSchema);
