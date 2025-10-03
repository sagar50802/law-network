// server/middlewares/isOwnerWrapper.js
// This file wraps your existing CommonJS middleware so ESM imports work safely.
import cjsIsOwner from "./isOwner.js";
export default cjsIsOwner;
