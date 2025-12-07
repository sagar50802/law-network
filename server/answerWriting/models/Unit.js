import mongoose from "mongoose";

const UnitSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    exam: { type: mongoose.Schema.Types.ObjectId, ref: "Exam", required: true },
  },
  { timestamps: true }
);

export default mongoose.models.Unit || mongoose.model("Unit", UnitSchema);
