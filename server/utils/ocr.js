// server/utils/r2.js
// Cloudflare R2 helper utils (ESM). Also supports a local fallback when R2 envs are missing.
// Exports used across routes: putR2, uploadBuffer, deleteByUrl, r2GetObjectStreamByUrl, r2Enabled.

import path from "node:path";
import fsp from "node:fs/promises";
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

const R2_ACCOUNT_ID        = process.env.R2_ACCOUNT_ID || "";
const R2_ACCESS_KEY_ID     = process.env.R2_ACCESS_KEY_ID || "";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "";
const R2_BUCKET            = process.env.R2_BUCKET || "";
// no trailing slash
export const R2_PUBLIC_BASE = (process.env.R2_PUBLIC_BASE || "").replace(/\/+$/, "");

export const r2Enabled =
  !!R2_ACCOUNT_ID &&
  !!R2_ACCESS_KEY_ID &&
  !!R2_SECRET_ACCESS_KEY &&
  !!R2_BUCKET &&
  !!R2_PUBLIC_BASE;

const s3 = r2Enabled
  ? new S3Client({
      region: "auto",
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    })
  : null;

/* -------------------- helpers -------------------- */

// Turn a public R2 URL into a bucket key, even if PUBLIC_BASE has a path prefix
function keyFromPublicUrl(url) {
  try {
    const base = new URL(R2_PUBLIC_BASE);
    const u = new URL(url);
    if (u.host !== base.host) return null;
    let key = u.pathname;
    if (base.pathname !== "/" && key.startsWith(base.pathname)) {
      key = key.slice(base.pathname.length);
    }
    return key.replace(/^\/+/, "");
  } catch {
    return null;
  }
}

function safeName(s = "file") {
  return String(s).normalize("NFKD").replace(/[^\w.\-]+/g, "_").slice(0, 140);
}

/* -------------------- R2: put/delete/get -------------------- */

/**
 * Low-level upload to R2 by explicit key.
 * @param {Buffer|Uint8Array} buffer
 * @param {{ key:string, contentType?:string, cacheControl?:string, filename?:string, contentDisposition?:string }} opts
 * @returns {Promise<string>} publicUrl
 */
export async function putR2(buffer, opts = {}) {
  const {
    key,
    contentType = "application/octet-stream",
    cacheControl = "public, max-age=31536000, immutable",
    filename = "file.bin",
    contentDisposition, // if not provided, we set inline; filename="..."
  } = opts;

  if (!buffer || !buffer.length) throw new Error("putR2: empty buffer");
  if (!key) throw new Error("putR2: key required");

  if (!r2Enabled) {
    // Local fallback: write under /server/uploads/r2-fallback/[key]
    const ROOT = path.join(process.cwd(), "server", "uploads", "r2-fallback");
    const abs = path.join(ROOT, key);
    await fsp.mkdir(path.dirname(abs), { recursive: true });
    await fsp.writeFile(abs, buffer);
    return `/uploads/r2-fallback/${key}`;
  }

  await s3.send(
    new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      CacheControl: cacheControl,
      ContentDisposition:
        contentDisposition || `inline; filename="${safeName(filename)}"`,
    })
  );
  return `${R2_PUBLIC_BASE}/${key}`;
}

/**
 * Convenience wrapper used in routes: builds a key from folder + filename.
 * @param {Buffer} buffer
 * @param {{ folder?:string, filename?:string, contentType?:string, cacheControl?:string }} opts
 * @returns {Promise<string>} publicUrl
 */
export async function uploadBuffer(buffer, opts = {}) {
  const {
    folder = "misc",
    filename = `${Date.now()}.bin`,
    contentType = "application/octet-stream",
    cacheControl = "public, max-age=31536000, immutable",
  } = opts;

  const cleanFolder = String(folder || "misc").replace(/^\/+|\/+$/g, "");
  const key = `${cleanFolder}/${Date.now()}_${Math.random().toString(36).slice(2, 10)}_${safeName(filename)}`;

  return putR2(buffer, {
    key,
    contentType,
    cacheControl,
    filename,
  });
}

/**
 * Delete an object by its public URL (no-op if not R2 or URL not under PUBLIC_BASE).
 * @param {string} url
 */
export async function deleteByUrl(url) {
  try {
    if (!r2Enabled || !url) return;
    const key = keyFromPublicUrl(url);
    if (!key) return;
    await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
  } catch (e) {
    console.warn("[r2] deleteByUrl warn:", e?.message || e);
  }
}

/**
 * Get object stream + headers by its public URL (used by stream proxies).
 * Returns null if the URL isn’t under PUBLIC_BASE or R2 disabled.
 * @param {string} url
 * @param {{ range?: string }} opts
 * @returns {Promise<null|{ status:number, headers:Record<string,string>, body:any }>}
 */
export async function r2GetObjectStreamByUrl(url, opts = {}) {
  if (!r2Enabled) return null;
  const key = keyFromPublicUrl(url);
  if (!key) return null;

  const { range } = opts;
  const obj = await s3.send(
    new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Range: range,
    })
  );

  const status = obj.ContentRange ? 206 : 200;
  const headers = {
    "Content-Type": obj.ContentType || "application/octet-stream",
    "Accept-Ranges": "bytes",
    "Cache-Control": obj.CacheControl || "no-transform, public, max-age=86400",
    "Access-Control-Expose-Headers": "Content-Length,Content-Range,Accept-Ranges",
    "Cross-Origin-Resource-Policy": "cross-origin",
    "Content-Disposition": obj.ContentDisposition || 'inline; filename="file"',
    Vary: "Range",
  };
  if (obj.ContentLength != null) headers["Content-Length"] = String(obj.ContentLength);
  if (obj.ContentRange) headers["Content-Range"] = obj.ContentRange;

  return { status, headers, body: obj.Body };
}
