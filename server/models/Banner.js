// server/models/Banner.js
import mongoose from "mongoose";

const bannerSchema = new mongoose.Schema(
  {
    title: { type: String, default: "" },
    type: { type: String, enum: ["image", "video"], default: "image", required: true },
    url:  { type: String, required: true }, // e.g. "/uploads/banners/1695900-banner.png"
  },
  { timestamps: true }
);

export default mongoose.model("Banner", bannerSchema);
