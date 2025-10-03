// server/models/Playlist.js
import mongoose from "mongoose";

const itemSchema = new mongoose.Schema({
  title: { type: String, required: true },
  artist: { type: String, default: "" },
  url: { type: String, required: true },
  locked: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
});

const playlistSchema = new mongoose.Schema({
  name: { type: String, required: true },
  items: [itemSchema],
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Playlist", playlistSchema);
