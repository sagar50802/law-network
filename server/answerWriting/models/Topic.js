// server/answerWriting/models/Topic.js
import mongoose from "mongoose";

const { Schema } = mongoose;

const TopicSchema = new Schema(
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
    name: {
      type: String,
      required: true,
      trim: true,
    },
    locked: {
      type: Boolean,
      default: false,
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

const Topic =
  mongoose.models.AnswerWritingTopic ||
  mongoose.model("AnswerWritingTopic", TopicSchema);

export default Topic;
