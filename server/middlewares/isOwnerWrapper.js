// server/middlewares/isOwnerWrapper.js
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
 * Try these, in order:
 *  1) ../../middlewares/isOwner.js         (repo-root/middlewares)
 *  2) ./isOwner.js                         (server/middlewares)
 *  3) ../middlewares/isOwner.js            (server/middlewares from nested callsites)
 */
const cjs = loadCjs([
  "../../middlewares/isOwner.js",
  "./isOwner.js",
  "../middlewares/isOwner.js",
]);

if (!cjs) {
  throw new Error(
    "Cannot locate middlewares/isOwner.js. Tried ../../middlewares/isOwner.js, ./isOwner.js, ../middlewares/isOwner.js"
  );
}

const isOwner = typeof cjs === "function" ? cjs : cjs.default;

export default function isOwnerWrapper(req, res, next) {
  return isOwner(req, res, next);
}
