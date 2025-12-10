import mongoose from "mongoose";

const questionSchema = new mongoose.Schema(
  {
    subtopicId: { type: mongoose.Schema.Types.ObjectId, ref: "Subtopic", required: true },

    questionText: { type: String, required: true },
    answerText: { type: String, required: true },

    releaseAt: { type: Date, required: true },

    order: { type: Number, default: 0 }
  },
  { timestamps: true }
);

const Question = mongoose.model("Question", questionSchema);
export default Question;
