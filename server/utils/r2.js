// server/utils/r2.js
// Cloudflare R2 helpers (AWS SDK v3). Works with ESM.
// Exports names expected by your routes: putR2, uploadBuffer, deleteByUrl,
// r2GetObjectStreamByUrl, getObjectByUrl, publicUrlForKey, r2Enabled.

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";

/* ---- Env ---- */
const R2_ACCOUNT_ID         = process.env.R2_ACCOUNT_ID || "";
const R2_ACCESS_KEY_ID      = process.env.R2_ACCESS_KEY_ID || "";
const R2_SECRET_ACCESS_KEY  = process.env.R2_SECRET_ACCESS_KEY || "";
const R2_BUCKET             = process.env.R2_BUCKET || "";
export const R2_PUBLIC_BASE = (process.env.R2_PUBLIC_BASE || "").replace(/\/+$/, "");

export const r2Enabled =
  !!R2_ACCOUNT_ID &&
  !!R2_ACCESS_KEY_ID &&
  !!R2_SECRET_ACCESS_KEY &&
  !!R2_BUCKET &&
  !!R2_PUBLIC_BASE;

/* ---- Client ---- */
export const s3 = r2Enabled
  ? new S3Client({
      region: "auto",
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    })
  : null;

/* ---- Helpers ---- */
export function publicUrlForKey(key) {
  if (!R2_PUBLIC_BASE) return "";
  return `${R2_PUBLIC_BASE}/${String(key).replace(/^\/+/, "")}`;
}

function keyFromPublicUrl(url) {
  try {
    const base = new URL(R2_PUBLIC_BASE);
    const u = new URL(url);
    if (u.host !== base.host) return null;
    let key = u.pathname;
    if (base.pathname !== "/" && key.startsWith(base.pathname)) {
      key = key.slice(base.pathname.length);
    }
    key = key.replace(/^\/+/, "");
    return key || null;
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
  if (!r2Enabled) throw new Error("R2 not configured");
  if (!key) throw new Error("key required");

  await s3.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: cacheControl,
      ...(contentDisposition ? { ContentDisposition: contentDisposition } : {}),
    })
  );
  return publicUrlForKey(key);
}

// Back-compat alias (some files import uploadBuffer)
export async function uploadBuffer(key, buffer, contentType, cacheControl, contentDisposition) {
  return putR2({
    key,
    body: buffer,
    contentType,
    cacheControl,
    contentDisposition,
  });
}

/* ---- Get / Stream ---- */
export async function getObjectByUrl(url, range) {
  if (!r2Enabled) throw new Error("R2 not configured");
  const key = keyFromPublicUrl(url);
  if (!key) throw new Error("URL not under R2_PUBLIC_BASE");
  const obj = await s3.send(
    new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Range: range, // may be undefined
    })
  );
  return { obj, key };
}

// Back-compat alias (some files import r2GetObjectStreamByUrl)
export async function r2GetObjectStreamByUrl(url, range) {
  const { obj } = await getObjectByUrl(url, range);
  return obj; // obj.Body is a Node readable stream
}

/* ---- Delete ---- */
export async function deleteByUrl(url) {
  if (!r2Enabled) return false;
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
