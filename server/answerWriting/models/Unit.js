// server/answerWriting/models/Unit.js
import mongoose from "mongoose";

const unitSchema = new mongoose.Schema(
  {
    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AnswerWritingExam",   // <--- UPDATED
      required: true,
    },
    name: { type: String, required: true },
  },
  { timestamps: true }
);

export default (
  mongoose.models.AnswerWritingUnit ||
  mongoose.model("AnswerWritingUnit", unitSchema)
);
