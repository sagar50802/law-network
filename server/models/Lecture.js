// server/models/Lecture.js
const mongoose = require("mongoose");

const mediaSchema = new mongoose.Schema(
  {
    videoUrl: String,
    audioUrl: String,
    imageUrl: String,
  },
  { _id: false }
);

const slideSchema = new mongoose.Schema(
  {
    topicTitle: { type: String, required: true },
    content: { type: String, required: true },
    media: mediaSchema,
    order: { type: Number, default: 0 },
  },
  { timestamps: true }
);

const lectureSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    subject: { type: String, required: true },
    avatarType: { type: String, default: "teacher1" },
    releaseAt: { type: Date, required: true },
    status: {
      type: String,
      enum: ["draft", "scheduled", "released", "completed"],
      default: "draft",
    },
    slides: [slideSchema],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Lecture", lectureSchema);
