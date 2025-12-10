import mongoose from "mongoose";

const examSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: String,
    isLocked: { type: Boolean, default: false }
  },
  { timestamps: true }
);

const Exam = mongoose.model("Exam", examSchema);
export default Exam;
