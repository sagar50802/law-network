import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import fs from "fs";

const s3 = new S3Client({
  region: "auto",
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY
  }
});

export async function uploadToR2(localPath, key) {
  const stream = fs.createReadStream(localPath);
  await s3.send(
    new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      Body: stream
    })
  );
  return `${process.env.R2_PUBLIC_BASE}/${key}`;
}

export async function getR2SignedUrl(key, expiresIn = 3600) {
  const cmd = new GetObjectCommand({ Bucket: process.env.R2_BUCKET, Key: key });
  return getSignedUrl(s3, cmd, { expiresIn });
}
