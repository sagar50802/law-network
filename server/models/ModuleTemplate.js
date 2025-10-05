import mongoose from "mongoose";

const FileSchema = new mongoose.Schema({
  type: { type: String, enum: ["pdf","image","audio","video"], required: true },
  url:  { type: String, required: true }
}, { _id: false });

const FlagsSchema = new mongoose.Schema({
  extractOCR:   { type: Boolean, default: true },
  showOriginal: { type: Boolean, default: false },
  allowDownload:{ type: Boolean, default: false },
  highlight:    { type: Boolean, default: false },
  background:   { type: String,  default: "" },   // e.g. "yellow"
}, { _id: false });

const ModuleTemplateSchema = new mongoose.Schema({
  examId:   { type: String, index: true, required: true },
  dayIndex: { type: Number, required: true },       // 1..N
  slotTime: { type: String, default: "09:00" },     // "HH:mm" local intention
  title:    { type: String, default: "Untitled" },
  files:    { type: [FileSchema], default: [] },    // can have many images
  ocrText:  { type: String, default: "" },          // stored once if extractOCR
  flags:    { type: FlagsSchema, default: () => ({}) },
  status:   { type: String, enum:["draft","scheduled","released"], default:"scheduled" },
  releaseAt:{ type: Date, default: null },          // not used by cohort logic, but kept if you later enable calendar-broadcast
}, { timestamps: true });

ModuleTemplateSchema.index({ examId:1, dayIndex:1 });

export default mongoose.models.ModuleTemplate ||
  mongoose.model("ModuleTemplate", ModuleTemplateSchema);
