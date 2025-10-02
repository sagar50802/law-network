// server/models/Playlist.js
import mongoose from "mongoose";

const itemSchema = new mongoose.Schema({
  title: String,
  artist: String,
  url: String,
  locked: Boolean,
});

const playlistSchema = new mongoose.Schema({
  name: { type: String, required: true },
  items: [itemSchema],
});

export default mongoose.model("Playlist", playlistSchema);
