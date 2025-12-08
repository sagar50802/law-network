import mongoose from "mongoose";

const topicSchema = new mongoose.Schema({
  unit: { type: mongoose.Schema.Types.ObjectId, ref: "Unit", required: true },
  name: { type: String, required: true },
  subtopics: [{ type: mongoose.Schema.Types.ObjectId, ref: "Subtopic" }]
});

export default mongoose.model("Topic", topicSchema);
