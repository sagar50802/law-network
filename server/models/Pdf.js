const mongoose = require('mongoose');

const pdfSchema = new mongoose.Schema({
  subject: { type: String, required: true },
  title: { type: String, required: true },
  pdfPath: { type: String, required: true },
  pages: { type: Number },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Pdf', pdfSchema);