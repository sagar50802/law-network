// server/models/ScholarMessage.js
const mongoose = require("mongoose");

const AttachmentSchema = new mongoose.Schema({
  filename: String,
  url: String,
  mime: String,
  size: Number,
}, { _id: false });

const ScholarMessageSchema = new mongoose.Schema({
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: "ScholarGroup", required: true, index: true },
  authorEmail: { type: String, required: true, trim: true },
  authorName:  { type: String, required: true, trim: true },
  text:        { type: String, default: "" },
  replyTo:     { type: mongoose.Schema.Types.ObjectId, ref: "ScholarMessage", default: null },
  attachments: { type: [AttachmentSchema], default: [] },
}, { timestamps: true });

module.exports = mongoose.model("ScholarMessage", ScholarMessageSchema);
