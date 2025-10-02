// server/models/Audio.js
import mongoose from "mongoose";

const audioSchema = new mongoose.Schema({
  title: { type: String, required: true },
  playlistName: { type: String, required: true },
  audioPath: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

// 👇 default export so ESModules can import Audio directly
export default mongoose.model("Audio", audioSchema);
