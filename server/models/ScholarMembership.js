// server/models/ScholarMembership.js
const mongoose = require("mongoose");

const ScholarMembershipSchema = new mongoose.Schema({
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: "ScholarGroup", required: true, index: true },
  email: { type: String, required: true, trim: true, index: true },
  name:  { type: String, required: true, trim: true },
  role:  { type: String, enum: ["owner", "member"], default: "member" },
}, { timestamps: true });

ScholarMembershipSchema.index({ groupId: 1, email: 1 }, { unique: true });

module.exports = mongoose.model("ScholarMembership", ScholarMembershipSchema);
