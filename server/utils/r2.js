// server/utils/r2.js
// ------------------------------------------------------------
// Cloudflare R2 Utilities — Unified Upload / Download / Delete
// ------------------------------------------------------------
// Supports: direct PUT uploads (pre-signed), buffer uploads, and retrievals.
// Safe for all your routes: classroom, podcasts, tests, prep, etc.
// ------------------------------------------------------------

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

/* -------------------- Environment -------------------- */
const R2_ACCOUNT_ID        = process.env.R2_ACCOUNT_ID || "";
const R2_ACCESS_KEY_ID     = process.env.R2_ACCESS_KEY_ID || "";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "";
const R2_BUCKET            = process.env.R2_BUCKET || "";
const R2_PUBLIC_BASE_RAW   = process.env.R2_PUBLIC_BASE || "";
export const R2_PUBLIC_BASE = R2_PUBLIC_BASE_RAW.replace(/\/+$/, "");

/* -------------------- Enable Check -------------------- */
export function r2Enabled() {
  return Boolean(
    R2_ACCOUNT_ID &&
    R2_ACCESS_KEY_ID &&
    R2_SECRET_ACCESS_KEY &&
    R2_BUCKET
  );
}

/* -------------------- Client -------------------- */
export const s3 = r2Enabled()
  ? new S3Client({
      region: "auto",
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      forcePathStyle: true, // Required for Cloudflare R2
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    })
  : null;

/* -------------------- Key Helpers -------------------- */
function safeKey(k = "") {
  return String(k)
    .replace(/^\/+/, "")
    .replace(/\s+/g, "_")
    .replace(/[^\w.\-\/]/g, "");
}

/* Normalize URLs for any upload (public.dev or native R2) */
export function publicUrlForKey(key) {
  const clean = safeKey(key);
  if (!clean) return "";
  if (R2_PUBLIC_BASE) return `${R2_PUBLIC_BASE}/${clean}`;
  return `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${R2_BUCKET}/${clean}`;
}

/* Extract key from either R2 public URL or native endpoint URL */
function keyFromPublicUrl(url) {
  try {
    const u = new URL(url);

    // case 1: public.dev
    if (R2_PUBLIC_BASE) {
      const base = new URL(R2_PUBLIC_BASE);
      if (u.host === base.host) {
        let path = u.pathname;
        if (base.pathname !== "/" && path.startsWith(base.pathname))
          path = path.slice(base.pathname.length);
        return safeKey(path);
      }
    }

    // case 2: native endpoint
    const nativeHost = `${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;
    if (u.host === nativeHost) {
      const p = u.pathname.replace(/^\/+/, ""); // bucket/key
      if (p.startsWith(`${R2_BUCKET}/`)) {
        return safeKey(p.slice(R2_BUCKET.length + 1));
      }
    }
    return null;
  } catch {
    return null;
  }
}

/* -------------------- Core Upload -------------------- */
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

/* Buffer upload — backward compatible for older routes */
export async function uploadBuffer(a, b, c) {
  if (!r2Enabled()) throw new Error("R2 not configured");

  if (Buffer.isBuffer(a)) {
    // Signature A: (buffer, filename, contentType)
    const buffer = a;
    const filename = b || "file";
    const contentType = c || "application/octet-stream";
    const key = `misc/${safeKey(filename)}`;
    return putR2({ key, body: buffer, contentType });
  } else {
    // Signature B: (key, buffer, contentType)
    const key = a;
    const buffer = b;
    const contentType = c || "application/octet-stream";
    return putR2({ key, body: buffer, contentType });
  }
}

/* -------------------- Pre-signed Upload -------------------- */
/**
 * Create a pre-signed PUT URL for direct client upload.
 * Example:
 *   const { uploadUrl, fileUrl } = await createPresignedPutUrl("classroom/123.mp4", "video/mp4")
 */
export async function createPresignedPutUrl(
  key,
  contentType = "application/octet-stream",
  expiresIn = 600
) {
  if (!r2Enabled()) throw new Error("R2 not configured");
  const safe = safeKey(key);

  const cmd = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: safe,
    ContentType: contentType,
  });

  const uploadUrl = await getSignedUrl(s3, cmd, { expiresIn });
  const fileUrl = publicUrlForKey(safe);
  return { uploadUrl, fileUrl };
}

/* -------------------- Get / Stream -------------------- */
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
  return obj; // .Body is a Node.js stream
}

/* -------------------- Delete -------------------- */
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
