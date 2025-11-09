// server/routes/classroomMediaUpload.js
// Handles direct classroom media uploads → Cloudflare R2, returns public URL

import express from "express";
import multer from "multer";
import { r2Enabled, uploadBuffer } from "../utils/r2.js";

const router = express.Router();

// Store file in memory (we push buffer to R2)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 100 * 1024 * 1024, // 100MB max
  },
});

router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!r2Enabled()) {
      return res.status(503).json({
        success: false,
        message: "Cloud storage (R2) is not configured on the server",
      });
    }

    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "No file uploaded" });
    }

    const file = req.file;

    // create safe key: classroom/<timestamp>-<filename>
    const safeName = file.originalname
      .replace(/\s+/g, "_")
      .replace(/[^\w.\-]/g, "");
    const key = `classroom/${Date.now()}-${safeName}`;

    const url = await uploadBuffer(key, file.buffer, file.mimetype);

    return res.json({
      success: true,
      url,
    });
  } catch (err) {
    console.error("Classroom media upload error:", err);
    return res.status(500).json({
      success: false,
      message: "Upload failed",
    });
  }
});

export default router;
