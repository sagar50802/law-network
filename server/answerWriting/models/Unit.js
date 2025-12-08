import mongoose from "mongoose";

const unitSchema = new mongoose.Schema({
  exam: { type: mongoose.Schema.Types.ObjectId, ref: "Exam", required: true },
  name: { type: String, required: true },
  topics: [{ type: mongoose.Schema.Types.ObjectId, ref: "Topic" }]
});

export default mongoose.model("Unit", unitSchema);
