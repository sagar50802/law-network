// Resolve API base: use env if provided; otherwise empty string so
// calls like "/api/..." stay relative and go through the Vite proxy in dev.
const RAW = (import.meta.env?.VITE_API_BASE ?? "").trim();
export const API_BASE = RAW ? RAW.replace(/\/+$/, "") : "";

// Join helper that avoids double slashes.
const join = (base, path) =>
  (base ? `${base}${path.startsWith("/") ? "" : "/"}${path}` : path).replace(
    /([^:]\/)\/+/g,
    "$1"
  );

export function authHeaders() {
  const key =
    localStorage.getItem("ownerKey") ||
    localStorage.getItem("OWNER_KEY") ||
    localStorage.getItem("owner_key");
  return key ? { Authorization: `Bearer ${key}`, "X-Owner-Key": key } : {};
}

export function apiUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;
  return join(API_BASE, path);
}

// Generic JSON requester (kept)
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

  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("application/json") ? await res.json() : await res.text();

  if (!res.ok) {
    const msg = typeof data === "string" ? data.slice(0, 200) : JSON.stringify(data);
    throw new Error(`HTTP ${res.status} ${res.statusText} — ${msg}`);
  }
  return data;
}

// ✅ Small, explicit JSON helper you asked for
export async function apiJSON(path, init = {}) {
  const res = await fetch(apiUrl(path), {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...authHeaders(), ...(init.headers || {}) },
    ...init,
  });
  const ct = res.headers.get("content-type") || "";
  const body = ct.includes("application/json") ? await res.json() : await res.text();
  if (!res.ok) throw new Error(typeof body === "string" ? body : JSON.stringify(body));
  return body;
}

export const getJSON = (p, o) => requestJSON(p, { ...o, method: "GET" });
export const postJSON = (p, d, o) => requestJSON(p, { ...o, method: "POST", body: d });
export const putJSON = (p, d, o) => requestJSON(p, { ...o, method: "PUT", body: d });
export const patchJSON = (p, d, o) => requestJSON(p, { ...o, method: "PATCH", body: d });
export const delJSON = (p, o) => requestJSON(p, { ...o, method: "DELETE" });

// Back-compat alias
export const fetchJSON = getJSON;

export async function upload(path, formData, opts = {}) {
  return requestJSON(path, { ...opts, method: "POST", body: formData });
}
export async function uploadFile(path, file, field = "file", extra = {}, opts = {}) {
  const fd = new FormData();
  fd.append(field, file);
  Object.entries(extra || {}).forEach(([k, v]) => fd.append(k, v));
  return upload(path, fd, opts);
}

export const absUrl = (p) => (/^https?:\/\//i.test(p) ? p : apiUrl(p));

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
  apiJSON,
};
