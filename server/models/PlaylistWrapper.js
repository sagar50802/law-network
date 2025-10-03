// server/models/PlaylistWrapper.js
import { createRequire } from "module";
const require = createRequire(import.meta.url);

// Load your existing CommonJS mongoose model
const cjsModel = require("./Playlist.js");

// Support either `module.exports = Model` or `{ default: Model }`
const Model = cjsModel?.default || cjsModel;

export default Model;
