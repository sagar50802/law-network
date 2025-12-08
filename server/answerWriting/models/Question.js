import mongoose from "mongoose";

const questionSchema = new mongoose.Schema({
  exam: { type: mongoose.Schema.Types.ObjectId, ref: "Exam", required: true },
  unit: { type: mongoose.Schema.Types.ObjectId, ref: "Unit", required: true },
  topic: { type: mongoose.Schema.Types.ObjectId, ref: "Topic", required: true },
  subtopic: { type: mongoose.Schema.Types.ObjectId, ref: "Subtopic" },

  questionHindi: String,
  questionEnglish: String,
  answerHindi: String,
  answerEnglish: String,

  releaseAt: { type: Date, required: true }
});

export default mongoose.model("Question", questionSchema);
