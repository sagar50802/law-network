import mongoose from "mongoose";

const plagiarismSchema = new mongoose.Schema({
  userEmail: String,
  text: String,
  score: Number,
  grammar: Number,
  clarity: Number,
  matches: [
    {
      sentence: String,
      type: String, // "plagiarized" | "grammar" | "unique"
    },
  ],
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("PlagiarismReport", plagiarismSchema);
