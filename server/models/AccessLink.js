// models/AccessLink.js
import mongoose from "mongoose";

const accessLinkSchema = new mongoose.Schema({
  token: { type: String, unique: true },        // magic key in URL
  lectureId: { type: mongoose.Schema.Types.ObjectId, ref: "Lecture" },
  isFree: { type: Boolean, default: false },
  // when link stops working (for both free & paid, you decide)
  expiresAt: { type: Date, required: true },

  // for paid links: list of users who are allowed
  allowedUsers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
});

export default mongoose.model("AccessLink", accessLinkSchema);
