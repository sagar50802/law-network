// routes/library.js
import express from "express";
import LibraryBook from "../models/LibraryBook.js";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const router = express.Router();

/* -------------------------------------------------------------
   R2 CLIENT
------------------------------------------------------------- */
const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

/* -------------------------------------------------------------
   SIGNED URL FOR DIRECT BROWSER UPLOAD (PUBLIC)
   GET /api/library/upload-url
------------------------------------------------------------- */
router.get("/upload-url", async (req, res) => {
  try {
    const { filename, type } = req.query;

    if (!filename) {
      return res.json({
        success: false,
        message: "filename is required",
      });
    }

    const ext = filename.split(".").pop();
    const safe = `${Date.now()}-${Math.random()
      .toString(36)
      .slice(2)}.${ext}`;

    const key = `library/${safe}`;

    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      ContentType: type || "application/octet-stream",
    });

    const uploadUrl = await getSignedUrl(r2, command, { expiresIn: 3600 });

    res.json({
      success: true,
      uploadUrl,
      fileUrl: `${process.env.R2_PUBLIC_BASE}/${key}`,
    });
  } catch (err) {
    console.error("R2 signed URL error:", err);
    res.json({
      success: false,
      message: "Failed to get upload URL",
    });
  }
});

/* -------------------------------------------------------------
   PUBLIC: GET ALL PUBLISHED BOOKS
   GET /api/library/books
------------------------------------------------------------- */
router.get("/books", async (_req, res) => {
  try {
    const books = await LibraryBook.find({ isPublished: true })
      .sort({ createdAt: -1 });

    res.json({ success: true, data: books });
  } catch (err) {
    console.error("GET /library/books error:", err);
    res.json({
      success: false,
      message: "Failed to fetch books",
    });
  }
});

/* -------------------------------------------------------------
   PUBLIC: GET A SINGLE BOOK (with pdfUrl + coverUrl)
   GET /api/library/books/:id
------------------------------------------------------------- */
router.get("/books/:id", async (req, res) => {
  try {
    const book = await LibraryBook.findById(req.params.id).lean();

    if (!book) {
      return res.json({
        success: false,
        message: "Not found",
      });
    }

    res.json({
      success: true,
      data: {
        _id: book._id,
        title: book.title,
        author: book.author,
        description: book.description,
        subject: book.subject,
        isPaid: book.isPaid,
        basePrice: book.basePrice,
        defaultReadingHours: book.defaultReadingHours,
        pdfUrl: book.pdfUrl,
        coverUrl: book.coverUrl,
      },
    });
  } catch (err) {
    console.error("GET /library/books/:id error:", err);
    res.json({
      success: false,
      message: "Failed to get book",
    });
  }
});

export default router;
