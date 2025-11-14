import mongoose from "mongoose";

const SlideSchema = new mongoose.Schema({
  id: { type: String, required: true },
  backgroundUrl: { type: String, required: true },
  rawText: { type: String, required: true },
  highlight: { type: String, default: "" }
});

const MagazineSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    subtitle: { type: String, default: "" },
    slug: { type: String, required: true, unique: true },
    slides: [SlideSchema],
  },
  { timestamps: true }
);

export default mongoose.models.Magazine ||
  mongoose.model("Magazine", MagazineSchema);
