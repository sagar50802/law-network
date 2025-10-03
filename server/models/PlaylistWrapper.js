// server/models/PlaylistWrapper.js
import { createRequire } from "module";
const require = createRequire(import.meta.url);

let mod;
try { mod = require("./Playlist.js"); } catch { /* ignore */ }

if (!mod) {
  throw new Error("Cannot locate models/Playlist.js next to this wrapper.");
}

const Model = mod?.default || mod;
export default Model;
