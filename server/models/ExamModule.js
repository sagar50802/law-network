import mongoose from "mongoose";

const ExamModuleSchema = new mongoose.Schema({
  examName: { type: String, required: true },
  title: { type: String, required: true },
  sourceType: { type: String, enum: ["pdf", "image"], required: true },
  r2Key: { type: String },
  audioR2Key: { type: String },
  ocrText: { type: String },
  releaseAt: { type: Date, required: true },
  showOriginal: { type: Boolean, default: false },
  durationMinutes: { type: Number, default: 0 },
  highlights: { type: [String], default: [] },
  createdBy: { type: String },
  createdAt: { type: Date, default: Date.now }
});
ExamModuleSchema.index({ examName: 1, releaseAt: 1 });
export default mongoose.model("ExamModule", ExamModuleSchema);
