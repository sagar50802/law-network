// server/utils/r2.js
import path from "path";
import fsp from "fs/promises";
import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

const ROOT = path.join(process.cwd(), "server");
const LOCAL_DIR = path.join(ROOT, "uploads", "exams");
await fsp.mkdir(LOCAL_DIR, { recursive: true }).catch(() => {});

export const R2_ACCOUNT_ID       = process.env.R2_ACCOUNT_ID || "";
export const R2_ACCESS_KEY_ID    = process.env.R2_ACCESS_KEY_ID || "";
export const R2_SECRET_ACCESS_KEY= process.env.R2_SECRET_ACCESS_KEY || "";
export const R2_BUCKET           = process.env.R2_BUCKET || "lawprepx";
export const R2_PUBLIC_BASE      = (process.env.R2_PUBLIC_BASE || "").replace(/\/+$/, "");
export const r2Ready = !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_PUBLIC_BASE);

export const s3 = r2Ready ? new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
}) : null;

const safeName = (s="file") => String(s).normalize("NFKD").replace(/[^\w.\-]+/g, "_").slice(0,120);

export async function uploadBuffer({ keyPrefix="exams", originalName="file.bin", buffer, contentType="application/octet-stream" }) {
  const ext = path.extname(originalName || "");
  const key = `${keyPrefix}/${Date.now()}_${Math.random().toString(36).slice(2)}${ext || ""}`;
  if (r2Ready) {
    await s3.send(new PutObjectCommand({
      Bucket: R2_BUCKET, Key: key, Body: buffer,
      ContentType: contentType, CacheControl: "public, max-age=31536000, immutable",
      ContentDisposition: `inline; filename="${safeName(originalName)}"`,
    }));
    return { url: `${R2_PUBLIC_BASE}/${key}`, provider: "r2", key };
  }
  const localName = safeName(`${Date.now()}_${Math.random().toString(36).slice(2)}${ext || ""}`);
  const dst = path.join(LOCAL_DIR, localName);
  await fsp.writeFile(dst, buffer);
  return { url: `/uploads/exams/${localName}`, provider: "local", key: localName };
}

export async function deleteByUrl(url="") {
  if (!url) return;
  try {
    if (r2Ready && url.startsWith(R2_PUBLIC_BASE + "/")) {
      const base = new URL(R2_PUBLIC_BASE);
      const u    = new URL(url);
      let key    = u.pathname;
      if (base.pathname !== "/" && key.startsWith(base.pathname)) key = key.slice(base.pathname.length);
      key = key.replace(/^\/+/, "");
      if (key) await s3.send(new DeleteObjectCommand({ Bucket: R2_BUCKET, Key: key }));
      return;
    }
    if (url.startsWith("/uploads/exams/")) {
      const abs = path.join(ROOT, url.replace(/^\/+/, ""));
      await fsp.unlink(abs).catch(() => {});
    }
  } catch {}
}

export function isPublicR2Url(u="") {
  return r2Ready && typeof u === "string" && u.startsWith(R2_PUBLIC_BASE + "/");
}

export async function r2GetObjectStreamByUrl(u, range) {
  if (!isPublicR2Url(u)) return null;
  const base = new URL(R2_PUBLIC_BASE);
  const x    = new URL(u);
  let key    = x.pathname;
  if (base.pathname !== "/" && key.startsWith(base.pathname)) key = key.slice(base.pathname.length);
  key = key.replace(/^\/+/, "");
  if (!key) return null;
  return await s3.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key, Range: range }));
}
