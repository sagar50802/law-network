const mongoose = require('mongoose');

const playlistSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  locked: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('Playlist', playlistSchema);