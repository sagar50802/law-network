import mongoose from "mongoose";

const examSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  nameHindi: { type: String, required: true },
  description: { type: String, trim: true },
  icon: { type: String, default: "⚖️" },
  totalQuestions: { type: Number, default: 0 },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

examSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

 export default mongoose.model("QnaExam", examSchema);

