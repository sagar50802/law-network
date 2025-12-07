import mongoose from "mongoose";

const UnitSchema = new mongoose.Schema({
  examId: { type: mongoose.Schema.Types.ObjectId, ref: "Exam", required: true },
  name: { type: String, required: true },
  locked: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.models.Unit || mongoose.model("Unit", UnitSchema);
