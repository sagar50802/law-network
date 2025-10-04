// server/models/VideoPlaylistWrapper.js
import { createRequire } from "module";
const require = createRequire(import.meta.url);

// Try a dedicated video model first (if you add one later), else fall back.
let mod;
try {
  mod = require("./VideoPlaylist.js"); // optional dedicated model (see Option B)
} catch { /* ignore */ }

if (!mod) {
  try {
    mod = require("./Playlist.js"); // reuse your existing playlist model
  } catch {
    // Match the error style of your PlaylistWrapper
    throw new Error("Cannot locate models/VideoPlaylist.js or models/Playlist.js next to this wrapper.");
  }
}

const Model = mod?.default || mod;
export default Model;
