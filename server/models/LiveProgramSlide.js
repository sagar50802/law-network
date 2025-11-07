import mongoose from "mongoose";

// 🧠 Each debate avatar (panelist / anchor)
const debateAvatarSchema = new mongoose.Schema(
  {
    code: { type: String, required: true },   // "A1", "A2", etc.
    name: { type: String, required: true },   // "Adv. Kavya Shah"
    role: { type: String, required: true },   // "Host", "Analyst"
    avatarType: {
      type: String,
      enum: ["LAWYER", "HISTORY", "POLICE", "IT"],
      default: "LAWYER",
    },
    voiceName: { type: String, default: "" }, // ✅ added properly INSIDE schema object
  },
  { _id: false }
);

// 📰 Main slide schema
const liveProgramSlideSchema = new mongoose.Schema({
  programType: {
    type: String,
    enum: ["LEGAL_NEWS", "HISTORY", "POLICE", "INFO", "DEBATE"],
    required: true,
  },
  programName: { type: String, default: "LawNetwork Live" },
  title: { type: String, required: true },
  content: { type: String, required: true },

  // for DEBATE only:
  debateAvatars: [debateAvatarSchema],
  debateScriptRaw: { type: String },

  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("LiveProgramSlide", liveProgramSlideSchema);
