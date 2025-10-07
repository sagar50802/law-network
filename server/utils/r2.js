// server/utils/r2.js
// Cloudflare R2 helpers (AWS SDK v3) — compatible with your routes.
// Exports: r2Enabled(), uploadBuffer(...), putR2(...), deleteByUrl(...),
//          r2GetObjectStreamByUrl(...), getObjectByUrl(...), publicUrlForKey(...)

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

/* ---- Env ---- */
const R2_ACCOUNT_ID        = process.env.R2_ACCOUNT_ID || "";
const R2_ACCESS_KEY_ID     = process.env.R2_ACCESS_KEY_ID || "";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "";
const R2_BUCKET            = process.env.R2_BUCKET || "";
const R2_PUBLIC_BASE_RAW   = process.env.R2_PUBLIC_BASE || "";
export const R2_PUBLIC_BASE = R2_PUBLIC_BASE_RAW.replace(/\/+$/, "");

/* ---- Enabled ---- */
export function r2Enabled() {
  // do NOT require R2_PUBLIC_BASE; fall back to native endpoint if absent
  return !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET);
}

/* ---- Client ---- */
export const s3 = r2Enabled()
  ? new S3Client({
      region: "auto",
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      forcePathStyle: true, // good with the native endpoint
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    })
  : null;

/* ---- Helpers ---- */
function safeKey(k = "") {
  return String(k)
    .replace(/^\/+/, "")
    .replace(/\s+/g, "_")
    .replace(/[^\w.\-\/]/g, "");
}

export function publicUrlForKey(key) {
  const clean = safeKey(key);
  if (!clean) return "";
  if (R2_PUBLIC_BASE) return `${R2_PUBLIC_BASE}/${clean}`;
  // native endpoint fallback (path-style: /bucket/key)
  return `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${clean}`;
}

function keyFromPublicUrl(url) {
  try {
    const u = new URL(url);

    // If public base configured, try that first
    if (R2_PUBLIC_BASE) {
      const base = new URL(R2_PUBLIC_BASE);
      if (u.host === base.host) {
        let keyPath = u.pathname;
        if (base.pathname !== "/" && keyPath.startsWith(base.pathname)) {
          keyPath = keyPath.slice(base.pathname.length);
        }
        return safeKey(keyPath);
      }
    }

    // Fallback: native endpoint https://<acct>.r2.cloudflarestorage.com/<bucket>/<key>
    const nativeHost = `${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
    if (u.host === nativeHost) {
      const p = u.pathname.replace(/^\/+/, ""); // bucket/key...
      if (p.startsWith(`${R2_BUCKET}/`)) {
        return safeKey(p.slice(R2_BUCKET.length + 1));
      }
    }
    return null;
  } catch {
    return null;
  }
}

/* ---- Put / Upload ---- */
export async function putR2({
  key,
  body,
  contentType = "application/octet-stream",
  cacheControl = "public, max-age=31536000, immutable",
  contentDisposition,
}) {
  if (!r2Enabled()) throw new Error("R2 not configured");
  if (!key) throw new Error("key required");
  const Key = safeKey(key);

  await s3.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key,
      Body: body,
      ContentType: contentType,
      CacheControl: cacheControl,
      ...(contentDisposition ? { ContentDisposition: contentDisposition } : {}),
    })
  );
  return publicUrlForKey(Key);
}

/**
 * uploadBuffer – compatible with BOTH signatures:
 *   A) (buffer, filename, contentType)
 *   B) (key, buffer, contentType)
 */
export async function uploadBuffer(a, b, c) {
  if (!r2Enabled()) throw new Error("R2 not configured");

  // Detect signature
  if (Buffer.isBuffer(a)) {
    // A) (buffer, filename, contentType)
    const buffer = a;
    const filename = b || "file";
    const contentType = c || "application/octet-stream";
    const key = `prep/${safeKey(filename)}`;
    return putR2({ key, body: buffer, contentType });
  } else {
    // B) (key, buffer, contentType)
    const key = a;
    const buffer = b;
    const contentType = c || "application/octet-stream";
    return putR2({ key, body: buffer, contentType });
  }
}

/* ---- Get / Stream ---- */
export async function getObjectByUrl(url, range) {
  if (!r2Enabled()) throw new Error("R2 not configured");
  const key = keyFromPublicUrl(url);
  if (!key) throw new Error("URL not an R2 object we can read");
  const obj = await s3.send(
    new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Range: range,
    })
  );
  return { obj, key };
}

export async function r2GetObjectStreamByUrl(url, range) {
  const { obj } = await getObjectByUrl(url, range);
  return obj; // .Body is a Node stream
}

/* ---- Delete ---- */
export async function deleteByUrl(url) {
  if (!r2Enabled()) return false;
  const key = keyFromPublicUrl(url);
  if (!key) return false;
  try {
    await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    return true;
  } catch (e) {
    console.warn("R2 deleteByUrl failed:", e?.message || e);
    return false;
  }
}
