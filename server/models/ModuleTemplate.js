// server/models/ModuleTemplate.js
import mongoose from "mongoose";
const FileSchema = new mongoose.Schema({
  type: { type: String, enum: ["pdf","image","audio"], required: true },
  url:  { type: String, required: true },
}, { _id: false });

const FlagsSchema = new mongoose.Schema({
  extractOCR:   { type: Boolean, default: false },
  showOriginal: { type: Boolean, default: true },
  allowDownload:{ type: Boolean, default: false },
  highlight:    { type: Boolean, default: false },
  background:   { type: String,  default: "none" }, // e.g. "yellow"
}, { _id: false });

const ModuleTemplateSchema = new mongoose.Schema({
  examId:   { type: String, required: true, index: true },
  dayIndex: { type: Number, required: true, index: true },     // 1..N
  slot:     { type: String, default: "08:00" },                // "HH:mm"
  releaseAt:{ type: Date, required: true },                    // absolute release
  title:    { type: String, required: true },
  description: { type: String, default: "" },

  files:    { type: [FileSchema], default: [] },
  ocrText:  { type: String, default: "" },
  flags:    { type: FlagsSchema, default: () => ({}) },
}, { timestamps: true });

ModuleTemplateSchema.index({ examId: 1, dayIndex: 1, slot: 1 }, { unique: false });

export default mongoose.models.ModuleTemplate || mongoose.model("ModuleTemplate", ModuleTemplateSchema);
