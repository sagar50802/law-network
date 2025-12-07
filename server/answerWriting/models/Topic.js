import mongoose from "mongoose";

const TopicSchema = new mongoose.Schema(
  {
    unit: { type: mongoose.Schema.Types.ObjectId, ref: "Unit", required: true },
    name: { type: String, required: true },
    locked: { type: Boolean, default: false },

    subtopics: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Subtopic",
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model("Topic", TopicSchema);
