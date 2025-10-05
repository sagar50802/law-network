import mongoose from "mongoose";

const PrepIntentSchema = new mongoose.Schema({
  examId:   { type: String, index: true },
  name:     { type: String, default: "" },
  phone:    { type: String, default: "" },
  email:    { type: String, index: true },
  priceINR: { type: Number, default: 0 },
  status:   { type: String, default: "new" },   // new | contacted | approved
}, { timestamps: true });

export default mongoose.models.PrepIntent ||
  mongoose.model("PrepIntent", PrepIntentSchema);
