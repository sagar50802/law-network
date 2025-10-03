// server/models/PlaylistWrapper.js
import { createRequire } from "module";
const require = createRequire(import.meta.url);

function loadCjs(paths) {
  for (const p of paths) {
    try {
      return require(p);
    } catch {}
  }
  return null;
}

/**
 * Try these common locations:
 *  1) ./Playlist.js                 (server/models/Playlist.js)
 *  2) ../models/Playlist.js         (server/models from a sibling)
 *  3) ../../models/Playlist.js      (repo-root/models/Playlist.js)
 */
const cjs = loadCjs([
  "./Playlist.js",
  "../models/Playlist.js",
  "../../models/Playlist.js",
]);

if (!cjs) {
  throw new Error(
    "Cannot locate models/Playlist.js. Tried ./Playlist.js, ../models/Playlist.js, ../../models/Playlist.js"
  );
}

const Model = cjs?.default || cjs; // support either export style

export default Model;
