// server/middlewares/isOwnerWrapper.js
import { createRequire } from "module";
const require = createRequire(import.meta.url);

// Load your existing CommonJS middleware
const cjsIsOwner = require("../../middlewares/isOwner.js");

// Support either `module.exports = fn` or `{ default: fn }`
const isOwner = typeof cjsIsOwner === "function" ? cjsIsOwner : cjsIsOwner?.default;

export default function isOwnerWrapper(req, res, next) {
  return isOwner(req, res, next);
}
