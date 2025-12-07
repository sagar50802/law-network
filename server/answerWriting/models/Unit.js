// server/answerWriting/models/Unit.js
import mongoose from "mongoose";

const unitSchema = new mongoose.Schema(
  {
    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Exam",
      required: true,
    },
    name: { type: String, required: true },
    locked: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const Unit = mongoose.model("Unit", unitSchema);
export default Unit;
