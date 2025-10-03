// server/middlewares/isOwnerWrapper.js
import { createRequire } from "module";
const require = createRequire(import.meta.url);

// Your existing CommonJS middleware is in the SAME folder:
const cjs = require("./isOwner.js");

// If the CJS module exports the function directly, use it; otherwise use .default
const isOwner = typeof cjs === "function" ? cjs : (cjs && cjs.default);

export default function isOwnerWrapper(req, res, next) {
  return isOwner(req, res, next);
}
