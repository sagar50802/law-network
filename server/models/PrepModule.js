// server/models/PrepModule.js
import mongoose from "mongoose";

const FileSchema = new mongoose.Schema(
  {
    kind: { type: String, default: "other" },       // "image" | "audio" | "video" | "pdf" | "other"
    url:  { type: String,  required: true },        // /api/files/prep/:id or external https URL
    mime: { type: String,  default: "" },           // e.g. image/jpeg, audio/mpeg
    name: { type: String,  default: "" },
  },
  { _id: false }
);

const FlagsSchema = new mongoose.Schema(
  {
    extractOCR: { type: Boolean, default: false },
    ocrAtRelease: { type: Boolean, default: false },
    deferOCRUntilRelease: { type: Boolean, default: false }, // legacy alias
    showOriginal: { type: Boolean, default: false },
    allowDownload: { type: Boolean, default: false },
    highlight: { type: Boolean, default: false },
    background: { type: String, default: "" },
  },
  { _id: false }
);

const PrepModuleSchema = new mongoose.Schema(
  {
    examId:   { type: String, required: true, index: true },
    dayIndex: { type: Number, required: true, index: true },
    slotMin:  { type: Number, default: 0, index: true },

    title:       { type: String, default: "" },
    description: { type: String, default: "" },

    // ✅ This is the important bit: persist modern attachments
    files: { type: [FileSchema], default: [] },

    // Legacy fields (kept for compatibility)
    images: [String],
    audio:  mongoose.Schema.Types.Mixed,
    video:  mongoose.Schema.Types.Mixed,
    pdf:    mongoose.Schema.Types.Mixed,

    text:    { type: String, default: "" },   // pasted text
    ocrText: { type: String, default: "" },

    flags: { type: FlagsSchema, default: () => ({}) },

    releaseAt: { type: Date },
    status:    { type: String, enum: ["scheduled", "released"], default: "released", index: true },
  },
  { timestamps: true, strict: true } // strict keeps schema clean; we explicitly allow files[]
);

export default mongoose.models.PrepModule || mongoose.model("PrepModule", PrepModuleSchema);
