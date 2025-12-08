import mongoose from "mongoose";

const subtopicSchema = new mongoose.Schema({
  topic: { type: mongoose.Schema.Types.ObjectId, ref: "Topic", required: true },
  name: { type: String, required: true },
});

export default mongoose.model("Subtopic", subtopicSchema);
