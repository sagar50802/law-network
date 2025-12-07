import mongoose from "mongoose";

const SubtopicSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    topic: { type: mongoose.Schema.Types.ObjectId, ref: "Topic", required: true },
  },
  { timestamps: true }
);

export default mongoose.models.Subtopic || mongoose.model("Subtopic", SubtopicSchema);
