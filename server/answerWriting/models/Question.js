const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema(
  {
    subtopicId: { type: mongoose.Schema.Types.ObjectId, ref: "Subtopic", required: true },

    hindiText: { type: String },
    englishText: { type: String },

    releaseAt: { type: Date, required: true },
    isReleased: { type: Boolean, default: false },

    // Auto mapping
    topicId: { type: mongoose.Schema.Types.ObjectId, ref: "Topic" },
    unitId: { type: mongoose.Schema.Types.ObjectId, ref: "Unit" },
    examId: { type: mongoose.Schema.Types.ObjectId, ref: "Exam" },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Question", questionSchema);
