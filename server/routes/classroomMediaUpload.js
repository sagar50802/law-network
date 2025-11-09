// server/routes/classroomMediaUpload.js
import express from "express";
import crypto from "crypto";
import { r2Enabled, createPresignedPutUrl } from "../utils/r2.js";

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

    // Create a clean key name like classroom/1731160000-abc123-myvideo.mp4
    const safeName = filename.replace(/\s+/g, "_").replace(/[^\w.\-]/g, "");
    const key = `classroom/${Date.now()}-${crypto
      .randomBytes(6)
      .toString("hex")}-${safeName}`;

    // ✅ Use new helper from utils/r2.js
    const { uploadUrl, fileUrl } = await createPresignedPutUrl(
      key,
      mimetype || "application/octet-stream"
    );

    return res.json({ success: true, uploadUrl, fileUrl });
  } catch (err) {
    console.error("Presign error:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to sign upload" });
  }
});

export default router;
