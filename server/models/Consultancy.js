const mongoose = require("mongoose");

const consultancySchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  imageUrl: String,
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Consultancy", consultancySchema);
