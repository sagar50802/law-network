const mongoose = require('mongoose');

const audioSchema = new mongoose.Schema({
  title: { type: String, required: true },
  playlistName: { type: String, required: true },
  audioPath: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Audio', audioSchema);