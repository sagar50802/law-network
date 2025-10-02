// server/models/Playlist.js
import mongoose from "mongoose";

const itemSchema = new mongoose.Schema({
  title: String,
  artist: String,
  url: String,
  locked: { type: Boolean, default: true },
});

const playlistSchema = new mongoose.Schema({
  name: { type: String, required: true },
  items: [itemSchema],
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Playlist", playlistSchema);
