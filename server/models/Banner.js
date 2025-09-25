// server/models/Banner.js
import mongoose from "mongoose";

const bannerSchema = new mongoose.Schema(
  {
    title: { type: String, default: "" },
    link: { type: String, default: "" },
    // stored in GridFS; URL like /api/files/banners/:id
    url: { type: String, required: true },
    type: { type: String, enum: ["image", "video"], default: "image" },
  },
  { timestamps: true }
);

export default mongoose.model("Banner", bannerSchema);
