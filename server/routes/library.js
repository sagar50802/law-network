// routes/library.js
import express from "express";
import crypto from "crypto";
import { HttpRequest } from "@aws-sdk/protocol-http";
import { S3RequestPresigner } from "@aws-sdk/s3-request-presigner";
import { formatUrl } from "@aws-sdk/util-format-url";

import { S3Client } from "@aws-sdk/client-s3";

import LibraryBook from "../models/LibraryBook.js";
import BookPurchase from "../models/BookPurchase.js";
import SeatReservation from "../models/SeatReservation.js";
import PaymentRequest from "../models/PaymentRequest.js";

const router = express.Router();

/* ----------------------------------------------------------------------
   AUTH STUBS (KEEP SAME)
---------------------------------------------------------------------- */
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

/* ----------------------------------------------------------------------
   CLOUDFLARE R2 CLIENT (FULL DIRECT UPLOAD MODE)
---------------------------------------------------------------------- */

const R2_BUCKET = process.env.R2_BUCKET;
const R2_ENDPOINT = process.env.R2_ENDPOINT;
const R2_PUBLIC_BASE = process.env.R2_PUBLIC_BASE?.replace(/\/$/, "");

const r2 = new S3Client({
  region: "auto",
  endpoint: R2_ENDPOINT,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

/* ----------------------------------------------------------------------
   Generate Signed Upload URL  (Direct PUT to R2)
   GET /api/library/upload-url?filename=xxx&type=xxx
---------------------------------------------------------------------- */
router.get("/upload-url", async (req, res) => {
  try {
    const { filename, type } = req.query;

    if (!filename)
      return res.json({ success: false, message: "Missing filename" });

    const ext = filename.includes(".") ? filename.split(".").pop() : "bin";
    const safeName = `${Date.now()}-${crypto.randomUUID()}.${ext}`;

    const key = `library/${safeName}`;
    const contentType = type || "application/octet-stream";

    // SIGN REQUEST
    const presigner = new S3RequestPresigner({
      ...r2.config,
      sha256: crypto.createHash,
    });

    const request = new HttpRequest({
      protocol: "https:",
      method: "PUT",
      path: `/${R2_BUCKET}/${key}`,
      headers: { "content-type": contentType },
      hostname: R2_ENDPOINT.replace("https://", ""),
    });

    const signed = await presigner.presign(request, { expiresIn: 3600 });

    return res.json({
      success: true,
      uploadUrl: formatUrl(signed),
      fileUrl: `${R2_PUBLIC_BASE}/${key}`,
    });
  } catch (err) {
    console.error("[R2] /upload-url error:", err);
    return res.json({ success: false, message: "Failed to generate upload URL" });
  }
});

/* ----------------------------------------------------------------------
   CREATE BOOK (metadata only, files already uploaded)
---------------------------------------------------------------------- */
router.post("/create", async (req, res) => {
  try {
    const { title, author, description, free, price, pdfUrl, coverUrl } = req.body;

    if (!title || !pdfUrl || !coverUrl) {
      return res.json({
        success: false,
        message: "Missing required fields",
      });
    }

    const isFree = String(free) === "true";

    const book = await LibraryBook.create({
      title,
      author,
      description,
      isPaid: !isFree,
      price: isFree ? 0 : Number(price) || 0,
      pdfUrl,
      coverUrl,
      isPublished: true,
    });

    return res.json({ success: true, data: book });
  } catch (err) {
    console.error("[Library] POST /create error:", err);
    return res.json({ success: false, message: "Failed to create book" });
  }
});

/* ----------------------------------------------------------------------
   PUBLIC BOOK LIST
---------------------------------------------------------------------- */
router.get("/books", async (_req, res) => {
  try {
    const books = await LibraryBook.find({ isPublished: true }).sort({
      createdAt: -1,
    });
    res.json({ success: true, data: books });
  } catch (err) {
    res.json({ success: false, message: "Failed to fetch books" });
  }
});

/* ----------------------------------------------------------------------
   GET SINGLE BOOK
---------------------------------------------------------------------- */
router.get("/books/:id", async (req, res) => {
  try {
    const book = await LibraryBook.findById(req.params.id);
    if (!book) return res.json({ success: false, message: "Book not found" });
    res.json({ success: true, data: book });
  } catch (err) {
    res.json({ success: false, message: "Failed to fetch book" });
  }
});

/* ----------------------------------------------------------------------
   DELETE BOOK
---------------------------------------------------------------------- */
router.get("/delete/:id", async (req, res) => {
  try {
    await LibraryBook.findByIdAndDelete(req.params.id);
    return res.json({ success: true, message: "Deleted" });
  } catch (err) {
    return res.json({ success: false, message: "Delete failed" });
  }
});

/* ----------------------------------------------------------------------
   🔽 KEEP ALL YOUR EXISTING PAYMENT + SEAT LOGIC BELOW AS-IS
---------------------------------------------------------------------- */

// you copy/paste your payment + seat + approve routes from previous version here
// (No modification needed)

export default router;
