import mongoose from "mongoose";

const unitSchema = new mongoose.Schema({
  examId: { type: mongoose.Schema.Types.ObjectId, ref: "QnaExam", required: true },
  order: { type: Number, required: true },
  name: { type: String, required: true, trim: true },
  nameHindi: { type: String, required: true },
  description: { type: String, trim: true },
  totalTopics: { type: Number, default: 0 },
  totalQuestions: { type: Number, default: 0 },
  completedQuestions: { type: Number, default: 0 },
  isLocked: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

unitSchema.virtual("topics", {
  ref: "Topic",
  localField: "_id",
  foreignField: "unitId",
});

export default mongoose.model("Unit", unitSchema);
