// server/utils/r2.js  (ESM)
import path from "path";
import fsp from "fs/promises";
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

const R2_ACCOUNT_ID       = process.env.R2_ACCOUNT_ID || "";
const R2_ACCESS_KEY_ID    = process.env.R2_ACCESS_KEY_ID || "";
const R2_SECRET_ACCESS_KEY= process.env.R2_SECRET_ACCESS_KEY || "";
const R2_BUCKET           = process.env.R2_BUCKET || "";
const R2_PUBLIC_BASE_RAW  = process.env.R2_PUBLIC_BASE || ""; // e.g. https://cdn.example.com
const R2_PUBLIC_BASE      = R2_PUBLIC_BASE_RAW.replace(/\/+$/,"");

export const r2Enabled =
  !!R2_ACCOUNT_ID && !!R2_ACCESS_KEY_ID && !!R2_SECRET_ACCESS_KEY && !!R2_BUCKET && !!R2_PUBLIC_BASE;

const s3 = r2Enabled
  ? new S3Client({
      region: "auto",
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
    })
  : null;

/* -------- local uploads fallback root -------- */
const ROOT = path.join(process.cwd(), "server");
const LOCAL_DIR = path.join(ROOT, "uploads");
await fsp.mkdir(LOCAL_DIR, { recursive: true }).catch(() => {});

/* -------- helpers -------- */
function safeName(name = "file.bin") {
  return String(name).normalize("NFKD").replace(/[^\w.\-]+/g, "_").slice(0, 120);
}
function publicUrlForKey(key) {
  return `${R2_PUBLIC_BASE}/${String(key).replace(/^\/+/, "")}`;
}
function keyFromPublicUrl(url) {
  try {
    const base = new URL(R2_PUBLIC_BASE);
    const u = new URL(url, R2_PUBLIC_BASE);
    if (u.host !== base.host) return null;

    let key = u.pathname;
    if (base.pathname !== "/" && key.startsWith(base.pathname)) key = key.slice(base.pathname.length);
    return key.replace(/^\/+/, "");
  } catch {
    return null;
  }
}

/* -------- main APIs (used by routes) -------- */

// generic "put file" (File-like or {buffer, originalname, mimetype})
export async function putAny(prefix, file) {
  const name = safeName(file?.originalname || "file.bin");
  const buf =
    file?.buffer ??
    (typeof file?.arrayBuffer === "function" ? Buffer.from(await file.arrayBuffer()) : null);
  if (!buf || !buf.length) throw new Error("putAny: empty buffer");

  const ext = path.extname(name) || "";
  const key = `${String(prefix).replace(/\/+$/,"")}/${Date.now()}_${Math.random()
    .toString(36)
    .slice(2, 10)}${ext}`;

  if (r2Enabled) {
    await s3.send(
      new PutObjectCommand({
        Bucket: R2_BUCKET,
        Key: key,
        Body: buf,
        ContentType: file?.mimetype || "application/octet-stream",
        CacheControl: "public, max-age=31536000, immutable",
        ContentDisposition: `inline; filename="${name}"`,
      })
    );
    return publicUrlForKey(key);
  }

  // fallback to local /uploads
  const abs = path.join(LOCAL_DIR, key);
  await fsp.mkdir(path.dirname(abs), { recursive: true });
  await fsp.writeFile(abs, buf);
  return `/uploads/${key}`;
}

// convenience for raw buffers
export async function uploadBuffer(prefix, buffer, filename = "file.bin", mimetype = "application/octet-stream") {
  return putAny(prefix, { buffer, originalname: filename, mimetype });
}

// delete by previously returned public URL (R2 or /uploads)
export async function deleteByUrl(url) {
  if (!url) return false;

  if (r2Enabled) {
    const key = keyFromPublicUrl(url);
    if (key) {
      try {
        await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
        return true;
      } catch {
        /* ignore and try local */
      }
    }
  }

  if (String(url).startsWith("/uploads/")) {
    const abs = path.join(ROOT, url.replace(/^\/+/, ""));
    await fsp.unlink(abs).catch(() => {});
    return true;
  }

  return false;
}

// fetch an R2 object stream by its public URL (used by streaming proxies)
export async function r2GetObjectStreamByUrl(url, rangeHeader = undefined) {
  if (!r2Enabled) return null;
  const key = keyFromPublicUrl(url);
  if (!key) return null;
  return s3.send(
    new GetObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Range: rangeHeader, // e.g. "bytes=0-"
    })
  );
}
