import mongoose from "mongoose";

const topicSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    unit: { type: mongoose.Schema.Types.ObjectId, ref: "Unit", required: true },
    locked: { type: Boolean, default: false },
    subtopics: [{ type: mongoose.Schema.Types.ObjectId, ref: "Subtopic" }]
  },
  { timestamps: true }
);

export default mongoose.models.Topic || mongoose.model("Topic", topicSchema);
