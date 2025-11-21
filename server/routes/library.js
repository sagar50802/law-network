import express from "express";
import LibraryBook from "../models/LibraryBook.js";

import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const router = express.Router();

/* ============================================================
   🌩️ R2 CLIENT
============================================================ */
const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

/* ============================================================
   🎯 R2 SIGNED URL GENERATOR
   GET /api/library/upload-url?filename=..&type=..
============================================================ */
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
    const unique = `${Date.now()}-${Math.random()
      .toString(36)
      .substring(2)}.${ext}`;

    const key = `library/${unique}`;

    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      ContentType: type || "application/octet-stream",
    });

    const uploadUrl = await getSignedUrl(r2, command, {
      expiresIn: 3600,
    });

    return res.json({
      success: true,
      uploadUrl,
      fileUrl: `${process.env.R2_PUBLIC_BASE}/${key}`,
    });
  } catch (err) {
    console.error("Signed URL error:", err);
    return res.json({
      success: false,
      message: "Failed to generate upload URL",
    });
  }
});

/* ============================================================
   📚 PUBLIC: GET ALL PUBLISHED BOOKS
   GET /api/library/books
============================================================ */
router.get("/books", async (_req, res) => {
  try {
    const books = await LibraryBook.find({ isPublished: true }).sort({
      createdAt: -1,
    });

    return res.json({ success: true, data: books });
  } catch (err) {
    console.error("GET /books error:", err);
    return res.json({ success: false, message: "Failed to load books" });
  }
});

/* ============================================================
   📘 PUBLIC: GET SINGLE BOOK
   GET /api/library/books/:id
============================================================ */
router.get("/books/:id", async (req, res) => {
  try {
    const book = await LibraryBook.findById(req.params.id).lean();

    if (!book || !book.isPublished) {
      return res.json({ success: false, message: "Not found" });
    }

    return res.json({
      success: true,
      data: {
        _id: book._id,
        title: book.title,
        author: book.author,
        description: book.description,
        subject: book.subject,
        isPaid: book.isPaid,
        basePrice: book.basePrice,
        pdfUrl: book.pdfUrl,
        coverUrl: book.coverUrl,
        defaultReadingHours: book.defaultReadingHours,
      },
    });
  } catch (err) {
    console.error("GET /books/:id error:", err);
    return res.json({ success: false, message: "Failed to load book" });
  }
});

export default router;
