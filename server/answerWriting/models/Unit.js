import mongoose from "mongoose";

const unitSchema = new mongoose.Schema(
  {
   examId: {
  type: mongoose.Schema.Types.ObjectId,
  ref: "AnswerWritingExam",
  required: true,
},
    name: { type: String, required: true },
  },
  { timestamps: true }
);

// Prevent OverwriteModelError
export default mongoose.models.Unit || mongoose.model("Unit", unitSchema);
