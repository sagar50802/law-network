import mongoose from "mongoose";

const TopicSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    unit: { type: mongoose.Schema.Types.ObjectId, ref: "Unit", required: true },
    locked: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.models.Topic || mongoose.model("Topic", TopicSchema);
