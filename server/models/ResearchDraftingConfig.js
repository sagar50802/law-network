// server/models/ResearchDraftingConfig.js
import mongoose from "mongoose";

const ResearchDraftingConfigSchema = new mongoose.Schema({
  key: { type: String, unique: true }, // "rd:config"
  upiId: { type: String, default: "" },
  defaultAmount: { type: Number, default: 299 },
  waNumber: { type: String, default: "" }, // "91XXXXXXXXXX" (no +)
}, { timestamps: true });

export default mongoose.model("ResearchDraftingConfig", ResearchDraftingConfigSchema);
