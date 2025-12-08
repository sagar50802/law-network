// server/answerWriting/models/Unit.js
import mongoose from "mongoose";

const { Schema } = mongoose;

const UnitSchema = new Schema(
  {
    examId: {
      type: Schema.Types.ObjectId,
      ref: "AnswerWritingExam",
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    order: {
      type: Number,
      default: 0,
    },
  },
  {
    timestamps: true,
  }
);

const Unit =
  mongoose.models.AnswerWritingUnit ||
  mongoose.model("AnswerWritingUnit", UnitSchema);

export default Unit;
