// server/answerWriting/models/Question.js
import mongoose from "mongoose";

const { Schema } = mongoose;

const QuestionSchema = new Schema(
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
    // optional – if you create questions directly under topic,
    // leave subtopicId null
    subtopicId: {
      type: Schema.Types.ObjectId,
      ref: "AnswerWritingSubtopic",
      default: null,
    },

    // BILINGUAL QUESTION
    questionHindi: {
      type: String,
      required: true,
      trim: true,
    },
    questionEnglish: {
      type: String,
      required: true,
      trim: true,
    },

    // BILINGUAL ANSWER
    answerHindi: {
      type: String,
      required: true,
      trim: true,
    },
    answerEnglish: {
      type: String,
      required: true,
      trim: true,
    },

    // release scheduling
    releaseAt: {
      type: Date,
      required: true,
    },

    // set true by scheduler / when released
    isPublished: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

const Question =
  mongoose.models.AnswerWritingQuestion ||
  mongoose.model("AnswerWritingQuestion", QuestionSchema);

export default Question;
