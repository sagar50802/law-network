import mongoose from "mongoose";

const subtopicSchema = new mongoose.Schema(
  {
    topicId: { type: mongoose.Schema.Types.ObjectId, ref: "Topic", required: true },
    name: { type: String, required: true },
    order: { type: Number, default: 0 }
  },
  { timestamps: true }
);

const Subtopic = mongoose.model("Subtopic", subtopicSchema);
export default Subtopic;
