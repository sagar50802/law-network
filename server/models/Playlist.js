// server/models/Playlist.js
import mongoose from "mongoose";

// Each audio item
const itemSchema = new mongoose.Schema({
  title: { type: String, default: "Untitled" },
  artist: { type: String, default: "" },
  url: { type: String, required: true },
  locked: { type: Boolean, default: true },
});

// Playlist containing many items
const playlistSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  items: [itemSchema],
  createdAt: { type: Date, default: Date.now },
});

export default mongoose.model("Playlist", playlistSchema);
