import mongoose from "mongoose";

const ProgressSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  questionId: { type: mongoose.Schema.Types.ObjectId, ref: "Question", required: true },

  lastViewedAt: { type: Date, default: Date.now },
  isCompleted: { type: Boolean, default: false },
  score: { type: Number, default: null },

  createdAt: { type: Date, default: Date.now },
});

const Progress = mongoose.model("Progress", ProgressSchema);

export default Progress;
