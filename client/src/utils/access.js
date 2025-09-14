// client/src/utils/access.js
import { API_BASE } from "./api";

const ACCESS_KEY = "access";

const makeKey = (feature, featureId, email) =>
  `${feature}:${featureId}:${(email || "").toLowerCase().trim()}`;

const readStore = () => {
  try {
    return JSON.parse(localStorage.getItem(ACCESS_KEY) || "{}");
  } catch {
    return {};
  }
};
const writeStore = (obj) => {
  try {
    localStorage.setItem(ACCESS_KEY, JSON.stringify(obj));
  } catch {}
};

/**
 * Persist an access grant locally and broadcast UI events immediately.
 * Returns the saved record: { expiry, message? }.
 */
export function saveAccess(feature, featureId, email, expiry, message) {
  const key = makeKey(feature, featureId, email);
  const ms = typeof expiry === "number" ? expiry : new Date(expiry).getTime();

  const store = readStore();
  store[key] = { expiry: ms, ...(message ? { message } : {}) };
  writeStore(store);

  const detail = { feature, featureId, email, expiry: ms, message };
  // notify the app right away
  window.dispatchEvent(new CustomEvent("accessUpdated", { detail }));
  window.dispatchEvent(new CustomEvent("accessGranted", { detail }));
  // also signal that local cache changed (same-tab listeners)
  window.dispatchEvent(
    new CustomEvent("accessUpdated", { detail: { ...detail, storageSync: true } })
  );

  return store[key];
}

/**
 * Remove an access grant locally and broadcast revoke events.
 */
export function clearAccess(feature, featureId, email) {
  const key = makeKey(feature, featureId, email);
  const store = readStore();
  if (store[key]) {
    delete store[key];
    writeStore(store);
  }
  const detail = { feature, featureId, email, revoked: true };
  window.dispatchEvent(new CustomEvent("accessUpdated", { detail }));
  window.dispatchEvent(new CustomEvent("accessRevoked", { detail }));
  window.dispatchEvent(
    new CustomEvent("accessUpdated", { detail: { ...detail, storageSync: true } })
  );
}

/**
 * Loads access for this (feature, featureId, email).
 * 1) Trusts valid local cache (for instant UI)
 * 2) Falls back to server `/api/access/status`
 * Returns { expiry, message? } or null.
 */
export async function loadAccess(feature, featureId, email) {
  const key = makeKey(feature, featureId, email);
  const store = readStore();
  const now = Date.now();
  const local = store[key];

  if (local?.expiry && local.expiry > now) return local;

  // clean up expired local entry
  if (local && (!local.expiry || local.expiry <= now)) {
    delete store[key];
    writeStore(store);
  }

  // ask server
  try {
    const qs = new URLSearchParams({ email, feature, featureId }).toString();
    const res = await fetch(`${API_BASE}/api/access/status?${qs}`, {
      credentials: "include",
    });
    if (res.ok) {
      const j = await res.json();
      if (j?.access && j.expiry) {
        const ms =
          typeof j.expiry === "number" ? j.expiry : new Date(j.expiry).getTime();
        const value = { expiry: ms, ...(j.message ? { message: j.message } : {}) };
        store[key] = value;
        writeStore(store);
        return value;
      }
    }
  } catch {
    // ignore network errors; we just report no access
  }

  return null;
}

// Optional helper (debug)
export function getAllAccess() {
  return readStore();
}
