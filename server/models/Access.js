// models/Access.js
const mongoose = require("mongoose");

const accessSchema = new mongoose.Schema({
  email: { type: String, required: true },
  feature: { type: String, enum: ["playlist", "video", "pdf", "article", "podcast"], required: true },
  featureId: { type: String, required: true },
  expiry: { type: Date, required: false },
  message: { type: String }
});

module.exports = mongoose.model("Access", accessSchema);
