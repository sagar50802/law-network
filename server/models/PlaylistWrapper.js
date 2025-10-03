// server/models/PlaylistWrapper.js
import { createRequire } from "module";
const require = createRequire(import.meta.url);

// Your existing CommonJS Mongoose model is in the SAME folder:
const cjs = require("./Playlist.js");

// If it's CommonJS, require() returns the model; if ESM compiled to CJS, it may be on .default
const Model = (cjs && cjs.default) || cjs;

export default Model;
