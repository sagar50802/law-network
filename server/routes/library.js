// routes/library.js
import express from "express";
import LibraryBook from "../models/LibraryBook.js";
import BookPurchase from "../models/BookPurchase.js";
import SeatReservation from "../models/SeatReservation.js";
import PaymentRequest from "../models/PaymentRequest.js";

import {
  S3Client,
  PutObjectCommand
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const router = express.Router();

/* ------------------------------------------------------------------
   AUTH (unchanged)
------------------------------------------------------------------ */
const requireAuth = (req, res, next) => {
  if (!req.user)
    return res.status(401).json({ success: false, message: "Unauthorized" });
  next();
};

const requireAdmin = (req, res, next) => {
  if (!req.user?.isAdmin)
    return res.status(403).json({ success: false, message: "Admin only" });
  next();
};

/* ------------------------------------------------------------------
   R2 CLIENT (NO EXTRA PACKAGES REQUIRED)
------------------------------------------------------------------ */
const r2 = new S3Client({
  region: "auto",
  endpoint: process.env.R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  }
});

/* ==================================================================
   GENERATE SIGNED UPLOAD URL
   GET /api/library/upload-url?filename=abc.pdf&type=application/pdf
================================================================== */
router.get("/upload-url", async (req, res) => {
  try {
    const { filename, type } = req.query;

    if (!filename)
      return res.json({ success: false, message: "filename is required" });

    const ext = filename.includes(".") ? filename.split(".").pop() : "";
    const safe = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const key = `library/${safe}`;

    const command = new PutObjectCommand({
      Bucket: process.env.R2_BUCKET,
      Key: key,
      ContentType: type || "application/octet-stream",
    });

    const uploadUrl = await getSignedUrl(r2, command, { expiresIn: 3600 });

    return res.json({
      success: true,
      uploadUrl,
      fileUrl: `${process.env.R2_PUBLIC_BASE}/${key}`
    });

  } catch (err) {
    console.error("R2 signed URL error:", err);
    return res.json({ success: false, message: "Failed to generate signed URL" });
  }
});

/* ==================================================================
   CREATE BOOK METADATA AFTER R2 UPLOAD
   POST /api/library/create
================================================================== */
router.post("/create", async (req, res) => {
  try {
    const { title, author, description, free, price, pdfUrl, coverUrl } = req.body;

    if (!title || !pdfUrl || !coverUrl)
      return res.json({ success: false, message: "Missing fields" });

    const isFree = String(free) === "true";

    const book = await LibraryBook.create({
      title,
      author,
      description,
      isPaid: !isFree,
      price: isFree ? 0 : Number(price) || 0,
      pdfUrl,
      coverUrl,
      isPublished: true
    });

    return res.json({ success: true, data: book });

  } catch (err) {
    console.error("Create book error:", err);
    return res.json({ success: false, message: "Failed to create book" });
  }
});

/* ==================================================================
   GET ALL BOOKS
================================================================== */
router.get("/books", async (_req, res) => {
  const books = await LibraryBook.find({ isPublished: true }).sort({ createdAt: -1 });
  res.json({ success: true, data: books });
});

/* ==================================================================
   GET SINGLE BOOK
================================================================== */
router.get("/books/:id", async (req, res) => {
  const book = await LibraryBook.findById(req.params.id);
  if (!book) return res.json({ success: false, message: "Not found" });
  res.json({ success: true, data: book });
});

/* ==================================================================
   DELETE BOOK
================================================================== */
router.get("/delete/:id", async (req, res) => {
  try {
    await LibraryBook.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: "Deleted" });
  } catch (err) {
    res.json({ success: false, message: "Delete failed" });
  }
});

/* ==================================================================
   (ALL YOUR PAYMENT + SEAT ROUTES REMAIN UNTOUCHED)
================================================================== */

export default router;
