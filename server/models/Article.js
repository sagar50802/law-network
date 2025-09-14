 const mongoose = require('mongoose');

const articleSchema = new mongoose.Schema({
  title: { type: String, required: true },
  html: { type: String, required: true },
  text: { type: String, required: true },
  imageUrl: { type: String },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Article', articleSchema);