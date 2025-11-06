import mongoose from "mongoose";

const liveTickerItemSchema = new mongoose.Schema({
  text: { type: String, required: true },
  kind: {
    type: String,
    enum: ["BREAKING", "INFO", "EXAM", "PROMO"],
    default: "INFO"
  },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model("LiveTickerItem", liveTickerItemSchema);
