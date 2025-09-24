const mongoose = require("mongoose");

const articleSchema = new mongoose.Schema({
  title: { type: String, required: true },
  content: { type: String, required: true }, // full text
  link: { type: String, default: "" },
  image: { type: String, default: "" },      // /uploads/articles/filename.jpg
  allowHtml: { type: Boolean, default: false },
  isFree: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model("Article", articleSchema);
