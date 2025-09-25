// server/models/NewsItem.js  (ESM)
import mongoose from "mongoose";

const newsItemSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    link:  { type: String, default: "" },
    image: { type: String, default: "" }, // can be /api/files/news/<id> or /uploads/...
  },
  { timestamps: true }
);

export default mongoose.model("NewsItem", newsItemSchema);
