// server/answerWriting/models/Subtopic.js
import mongoose from "mongoose";

const { Schema } = mongoose;

const SubtopicSchema = new Schema(
  {
    examId: {
      type: Schema.Types.ObjectId,
      ref: "AnswerWritingExam",
      required: true,
    },
    unitId: {
      type: Schema.Types.ObjectId,
      ref: "AnswerWritingUnit",
      required: true,
    },
    topicId: {
      type: Schema.Types.ObjectId,
      ref: "AnswerWritingTopic",
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

const Subtopic =
  mongoose.models.AnswerWritingSubtopic ||
  mongoose.model("AnswerWritingSubtopic", SubtopicSchema);

export default Subtopic;
