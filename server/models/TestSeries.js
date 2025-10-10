// server/models/TestSeries.js
import mongoose from "mongoose";

const QuestionSchema = new mongoose.Schema({
  n: Number,                                      // 1..150
  q: { type: String, required: true },            // question text
  options: [{ type: String, required: true }],    // ["A", "B", "C", "D", ...]
  ans: { type: Number, required: true },          // index into options (0-based)
  expl: { type: String, default: "" },            // explanation (optional)
  source: { type: String, default: "" }           // e.g., "66th BPSC (Pre) 2020"
}, { _id: false });

const TestSchema = new mongoose.Schema({
  paper: { type: String, index: true, required: true }, // "UP Judicial Services Prelims Paper 1"
  code: { type: String, index: true, required: true },  // slug: "upjs-paper1-mock1"
  title: { type: String, required: true },              // "Mock Test - 1"
  durationMin: { type: Number, default: 120 },
  totalMarks: { type: Number, default: 150 },
  negative: { type: Number, default: 0.33 },
  questions: { type: [QuestionSchema], default: [] },
}, { timestamps: true });

const AttemptSchema = new mongoose.Schema({
  testCode: { type: String, index: true, required: true },
  user: { type: String, index: true, required: true },  // email or userId; keep string for now
  answers: { type: Map, of: Number, default: {} },      // { "1": 0, "2": 2, ... } (0-based option index)
  meta: { type: Object, default: {} },
  score: {
    correct: { type: Number, default: 0 },
    wrong: { type: Number, default: 0 },
    blank: { type: Number, default: 0 },
    marks: { type: Number, default: 0 },
    timeTakenSec: { type: Number, default: 0 },
  }
}, { timestamps: true });

export const TestSeriesTest = mongoose.model("TestSeriesTest", TestSchema);
export const TestSeriesAttempt = mongoose.model("TestSeriesAttempt", AttemptSchema);
