// client/src/utils/api.js

// ✅ Safe fallback to "/api" if VITE_API_BASE is missing
const RAW_BASE = (import.meta.env?.VITE_API_BASE ?? "/api").trim();

// ✅ Clean final base without trailing slashes
export const API_BASE = RAW_BASE.replace(/\/+$/, "");

// ✅ Joins API_BASE and path safely
const join = (base, path) =>
  (base ? `${base}${path.startsWith("/") ? "" : "/"}${path}` : path)
    .replace(/([^:]\/)\/+/g, "$1"); // avoid duplicate slashes

// ✅ Auth header injection (admin-only)
export function authHeaders() {
  const key = localStorage.getItem("ownerKey");
  return key ? { Authorization: `Bearer ${key}`, "X-Owner-Key": key } : {};
}

// ✅ Builds full URL for API routes
export function apiUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;
  return join(API_BASE, path); // "" in dev so we use Vite proxy (/api/*)
}

// ✅ Main request logic
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
    body: body instanceof FormData ? body : body != null ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText} ${text}`);
  }

  const ct = res.headers.get("content-type") || "";
  return ct.includes("application/json") ? res.json() : res.text();
}

// ✅ Method wrappers
export const getJSON   = (p, o) => requestJSON(p, { ...o, method: "GET" });
export const postJSON  = (p, d, o) => requestJSON(p, { ...o, method: "POST",  body: d });
export const putJSON   = (p, d, o) => requestJSON(p, { ...o, method: "PUT",   body: d });
export const patchJSON = (p, d, o) => requestJSON(p, { ...o, method: "PATCH", body: d });
export const delJSON   = (p, o)    => requestJSON(p, { ...o, method: "DELETE" });

// ✅ Compatibility alias
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

// ✅ Media path resolver
export const absUrl = (p) => (/^https?:\/\//i.test(p) ? p : apiUrl(p));

// ✅ Optional alias
export { apiUrl as apiurl };

// ✅ Full export for `import api from`
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
