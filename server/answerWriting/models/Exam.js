import mongoose from "mongoose";

const examSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    units: [{ type: mongoose.Schema.Types.ObjectId, ref: "Unit" }]
  },
  { timestamps: true }
);

export default mongoose.models.Exam || mongoose.model("Exam", examSchema);
