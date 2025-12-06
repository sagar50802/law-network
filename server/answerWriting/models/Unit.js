import mongoose from "mongoose";

const UnitSchema = new mongoose.Schema(
  {
    examId: { type: mongoose.Schema.Types.ObjectId, ref: "AnswerWritingExam", required: true },
    name: String,
  },
  { timestamps: true }
);

const Unit = mongoose.model("AnswerWritingUnit", UnitSchema);
export default Unit;
