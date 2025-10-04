// server/models/VideoPlaylistWrapper.js
import { createRequire } from "module";
const require = createRequire(import.meta.url);

let cjs;
try { cjs = require("./VideoPlaylist.js"); } catch {}
try { if (!cjs) cjs = require("../models/VideoPlaylist.js"); } catch {}
try { if (!cjs) cjs = require("../../models/VideoPlaylist.js"); } catch {}

// Fallback: if you don't have a separate VideoPlaylist model yet,
// this will gracefully reuse your Playlist model so Admin can add playlists today.
try { if (!cjs) cjs = require("./Playlist.js"); } catch {}
try { if (!cjs) cjs = require("../models/Playlist.js"); } catch {}
try { if (!cjs) cjs = require("../../models/Playlist.js"); } catch {}

if (!cjs) {
  throw new Error("Cannot locate VideoPlaylist.js (or fallback Playlist.js). Place it next to this wrapper or under server/models/.");
}

const Model = cjs?.default || cjs;
export default Model;
