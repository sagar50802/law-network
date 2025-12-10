import mongoose from "mongoose";

const topicSchema = new mongoose.Schema(
  {
    unitId: { type: mongoose.Schema.Types.ObjectId, ref: "Unit", required: true },
    name: { type: String, required: true },
    order: { type: Number, default: 0 }
  },
  { timestamps: true }
);

const Topic = mongoose.model("Topic", topicSchema);
export default Topic;
