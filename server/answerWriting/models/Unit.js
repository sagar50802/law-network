import mongoose from "mongoose";

const unitSchema = new mongoose.Schema(
  {
    examId: { type: mongoose.Schema.Types.ObjectId, ref: "Exam", required: true },
    name: { type: String, required: true, trim: true },
  },
  { timestamps: true }
);

export default mongoose.models.Unit || mongoose.model("Unit", unitSchema);
