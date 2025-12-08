import mongoose from "mongoose";

const subtopicSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    topic: { type: mongoose.Schema.Types.ObjectId, ref: "Topic", required: true },
    questions: [{ type: mongoose.Schema.Types.ObjectId, ref: "Question" }]
  },
  { timestamps: true }
);

export default mongoose.models.Subtopic || mongoose.model("Subtopic", subtopicSchema);
