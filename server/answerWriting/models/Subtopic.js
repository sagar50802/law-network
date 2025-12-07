// server/answerWriting/models/Subtopic.js
import mongoose from "mongoose";

const subtopicSchema = new mongoose.Schema(
  {
    topicId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Topic",
      required: true,
    },
    name: { type: String, required: true },
  },
  { timestamps: true }
);

const Subtopic = mongoose.model("Subtopic", subtopicSchema);
export default Subtopic;
