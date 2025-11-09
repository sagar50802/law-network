// server/routes/classroomMediaUpload.js
import express from "express";
import crypto from "crypto";
import { r2Enabled, s3 } from "../utils/r2.js";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const router = express.Router();

/* ─────────────────────────────
   Generate Pre-signed Upload URL
   POST /api/classroom/media/sign
   ───────────────────────────── */
router.post("/sign", async (req, res) => {
  try {
    if (!r2Enabled()) {
      return res.status(503).json({
        success: false,
        message: "R2 storage not configured",
      });
    }

    const { filename, mimetype } = req.body || {};
    if (!filename) {
      return res
        .status(400)
        .json({ success: false, message: "Missing filename" });
    }

    const safeName = filename.replace(/\s+/g, "_").replace(/[^\w.\-]/g, "");
    const key = `classroom/${Date.now()}-${crypto
      .randomBytes(6)
      .toString("hex")}-${safeName}`;

    // ✅ Correct way to generate presigned URL
    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      ContentType: mimetype || "application/octet-stream",
    });

    const uploadUrl = await getSignedUrl(s3, command, { expiresIn: 600 }); // 10 min validity

    const publicUrl = `${process.env.R2_PUBLIC_BASE.replace(/\/$/, "")}/${key}`;
    return res.json({
      success: true,
      uploadUrl,
      fileUrl: publicUrl,
    });
  } catch (err) {
    console.error("Presign error:", err);
    res.status(500).json({ success: false, message: "Failed to sign upload" });
  }
});

export default router;
