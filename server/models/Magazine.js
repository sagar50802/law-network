import mongoose from "mongoose";

const SlideSchema = new mongoose.Schema({
  id: { type: String, required: false },           // ❗ make optional
  backgroundUrl: { type: String, default: "" },    // ❗ avoid undefined
  rawText: { type: String, default: "" },          // ❗ avoid crash
  highlight: { type: String, default: "" }
});

const MagazineSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    subtitle: { type: String, default: "" },
    slug: { type: String, required: true, unique: true },
    slides: {
      type: [SlideSchema],
      default: []                                  // ❗ prevents crash
    }
  },
  { timestamps: true }
);

export default mongoose.models.Magazine ||
 mongoose.model("Magazine", MagazineSchema);
