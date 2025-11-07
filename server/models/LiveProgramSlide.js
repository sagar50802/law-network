import mongoose from "mongoose";

const debateAvatarSchema = new mongoose.Schema({
  code: { type: String, required: true },   // "A1", "A2", etc.
  name: { type: String, required: true },   // "Adv. Kavya Shah"
  role: { type: String, required: true },   // "Host", "Analyst"
  avatarType: {                             
    type: String,
    enum: ["LAWYER", "HISTORY", "POLICE", "IT"],
    default: "LAWYER"
  }
  voiceName: { type: String, default: "" },   // ✅ added line
}, { _id: false });

const liveProgramSlideSchema = new mongoose.Schema({
  programType: {
    type: String,
    enum: ["LEGAL_NEWS", "HISTORY", "POLICE", "INFO", "DEBATE"],
    required: true
  },
  programName: { type: String, default: "LawNetwork Live" }, // e.g. "Politics Ki Baat"
  title: { type: String, required: true },   // headline
  content: { type: String, required: true }, // full plain text
  // for DEBATE only:
  debateAvatars: [debateAvatarSchema],       // list of panelists
  debateScriptRaw: { type: String },         // optional raw tagged script "[A1] ... "
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

export default mongoose.model("LiveProgramSlide", liveProgramSlideSchema);
