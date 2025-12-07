import mongoose from "mongoose";

const ExamSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    units: [{ type: mongoose.Schema.Types.ObjectId, ref: "Unit" }],
  },
  { timestamps: true }
);

// SAFE EXPORT → prevents OverwriteModelError
export default mongoose.models.Exam ||
  mongoose.model("Exam", ExamSchema);
