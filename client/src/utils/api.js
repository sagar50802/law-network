// client/src/utils/api.js

// ✅ Decide base depending on environment
let RAW_BASE;

if (import.meta.env?.VITE_API_BASE) {
  // use .env if provided
  RAW_BASE = import.meta.env.VITE_API_BASE;
} else if (window.location.hostname === "localhost") {
  // local dev → backend on localhost:2025
  RAW_BASE = "http://localhost:2025/api";
} else {
  // production (Render backend URL)
  RAW_BASE = "https://lawnetwork-api.onrender.com/api";
}

RAW_BASE = RAW_BASE.trim();

// ✅ Clean final base (remove trailing /)
export const API_BASE = RAW_BASE.replace(/\/+$/, "");

// ✅ Helper to join base + path without duplicate slashes
function join(base, path) {
  return (base ? `${base}${path.startsWith("/") ? "" : "/"}${path}` : path)
    .replace(/([^:]\/)\/+/g, "$1");
}

// ✅ Injects admin auth headers if key exists in localStorage
export function authHeaders() {
  const key = localStorage.getItem("ownerKey");
  return key
    ? { Authorization: `Bearer ${key}`, "X-Owner-Key": key }
    : {};
}

// ✅ Resolve absolute API URL
export function apiUrl(path) {
  if (/^https?:\/\//i.test(path)) return path; // if already full URL
  return join(API_BASE, path); // fallback to /api/*
}

// ✅ Core request logic
async function requestJSON(path, options = {}) {
  const { method = "GET", headers = {}, body } = options;

  const res = await fetch(apiUrl(path), {
    method,
    credentials: "include",
    headers: {
      ...(body instanceof FormData ? {} : { "Content-Type": "application/json" }),
      ...authHeaders(),
      ...headers,
    },
    body:
      body instanceof FormData
        ? body
        : body != null
        ? JSON.stringify(body)
        : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText} ${text}`);
  }

  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : res.text();
}

// ✅ Shorthand wrappers
export const getJSON   = (p, o) => requestJSON(p, { ...o, method: "GET" });
export const postJSON  = (p, d, o) => requestJSON(p, { ...o, method: "POST",  body: d });
export const putJSON   = (p, d, o) => requestJSON(p, { ...o, method: "PUT",   body: d });
export const patchJSON = (p, d, o) => requestJSON(p, { ...o, method: "PATCH", body: d });
export const delJSON   = (p, o)    => requestJSON(p, { ...o, method: "DELETE" });

// ✅ Compatibility alias (so old code using fetchJSON still works)
export const fetchJSON = getJSON;

// ✅ File upload helpers
export async function upload(path, formData, opts = {}) {
  return requestJSON(path, { ...opts, method: "POST", body: formData });
}

export async function uploadFile(path, file, field = "file", extra = {}, opts = {}) {
  const fd = new FormData();
  fd.append(field, file);
  Object.entries(extra || {}).forEach(([k, v]) => fd.append(k, v));
  return upload(path, fd, opts);
}

// ✅ Absolute media path resolver
export const absUrl = (p) => (/^https?:\/\//i.test(p) ? p : apiUrl(p));

// ✅ Default export (bundle everything)
export default {
  API_BASE,
  authHeaders,
  apiUrl,
  getJSON,
  postJSON,
  putJSON,
  patchJSON,
  delJSON,
  fetchJSON,
  upload,
  uploadFile,
  absUrl,
};
