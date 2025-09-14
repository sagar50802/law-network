// server/models/ScholarGroup.js
const mongoose = require("mongoose");

const ScholarGroupSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  description: { type: String, default: "" },
  inviteCode: { type: String, required: true, index: true }, // e.g., ABC123
  deadlineAt: { type: Date, default: null }, // dissertation/group deadline
  createdBy: { type: String, default: "" },  // admin email or name
}, { timestamps: true });

module.exports = mongoose.model("ScholarGroup", ScholarGroupSchema);
