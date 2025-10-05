import mongoose from "mongoose";

const PrepOverlaySchema = new mongoose.Schema({
  examId:   { type: String, unique: true, required: true },
  upiId:    { type: String, default: "" },        // e.g. yourname@paytm
  upiName:  { type: String, default: "" },        // optional receiver display
  priceINR: { type: Number, default: 0 },         // price for this exam
  bannerUrl:{ type: String, default: "" },        // R2/local URL (shown to users)
  whatsappId: { type: String, default: "" },      // 10/12-digit or wa.me id
  whatsappQR: { type: String, default: "" },      // stored, not shown (optional)
}, { timestamps: true });

export default mongoose.models.PrepOverlay ||
  mongoose.model("PrepOverlay", PrepOverlaySchema);
