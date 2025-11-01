// server/models/ResearchDraftingConfig.js
import mongoose from "mongoose";

const schema = new mongoose.Schema({
  key: { type: String, unique: true }, // "rd:config"
  upiId: { type: String, default: "" },
  defaultAmount: { type: Number, default: 299 },
  waNumber: { type: String, default: "" },
}, { timestamps: true });

export default mongoose.models.ResearchDraftingConfig ||
       mongoose.model("ResearchDraftingConfig", schema);
