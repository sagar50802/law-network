import mongoose from "mongoose";

const unitSchema = new mongoose.Schema(
  {
    examId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AnswerWritingExam",
      required: true,
    },
    name: { type: String, required: true },
  },
  {
    timestamps: true,
    collection: "answer_writing_units",
  }
);

export default (
  mongoose.models.AnswerWritingUnit ||
  mongoose.model("AnswerWritingUnit", unitSchema)
);
