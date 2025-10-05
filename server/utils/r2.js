import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const R2_ACCOUNT_ID       = process.env.R2_ACCOUNT_ID || "";
const R2_ACCESS_KEY_ID    = process.env.R2_ACCESS_KEY_ID || "";
const R2_SECRET_ACCESS_KEY= process.env.R2_SECRET_ACCESS_KEY || "";
export const R2_BUCKET    = process.env.R2_BUCKET || "lawprepx";
export const R2_PUBLIC_BASE = (process.env.R2_PUBLIC_BASE || "").replace(/\/+$/,"");

export const r2Enabled = !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_PUBLIC_BASE);

export const s3 = r2Enabled ? new S3Client({
  region: "auto",
  endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
}) : null;

export async function putR2({ key, body, contentType }) {
  if (!r2Enabled) return null;
  await s3.send(new PutObjectCommand({
    Bucket: R2_BUCKET, Key: key, Body: body,
    ContentType: contentType || "application/octet-stream",
    CacheControl: "public, max-age=31536000, immutable",
  }));
  return `${R2_PUBLIC_BASE}/${key}`;
}
