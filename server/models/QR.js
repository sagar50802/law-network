 import mongoose from "mongoose";

const QrSchema = new mongoose.Schema(
  {
    imagePath: String,
    imageUrl: { type: String, required: true },
    note: String,
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.model("Qr", QrSchema);
