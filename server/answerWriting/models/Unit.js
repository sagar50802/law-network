import mongoose from "mongoose";

const UnitSchema = new mongoose.Schema(
  {
    exam: { type: mongoose.Schema.Types.ObjectId, ref: "Exam", required: true },
    name: { type: String, required: true },

    topics: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Topic",
      },
    ],
  },
  { timestamps: true }
);

export default mongoose.model("Unit", UnitSchema);
