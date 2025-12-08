import mongoose from "mongoose";

const topicSchema = new mongoose.Schema(
  {
    unitId: { type: mongoose.Schema.Types.ObjectId, ref: "Unit", required: true },
    name: { type: String, required: true, trim: true },
    locked: { type: Boolean, default: false },
  },
  { timestamps: true }
);

export default mongoose.models.Topic || mongoose.model("Topic", topicSchema);
