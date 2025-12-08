import mongoose from "mongoose";

const examSchema = new mongoose.Schema({
  name: { type: String, required: true },
  units: [{ type: mongoose.Schema.Types.ObjectId, ref: "Unit" }],
});

export default mongoose.model("Exam", examSchema);
