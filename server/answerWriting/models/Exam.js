// server/answerWriting/models/Exam.js
import mongoose from "mongoose";

const examSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
  },
  { timestamps: true }
);

export default mongoose.models.Exam || mongoose.model("Exam", examSchema);
