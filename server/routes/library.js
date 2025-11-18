// routes/library.js
import express from "express";
import LibraryBook from "../models/LibraryBook.js";
import BookPurchase from "../models/BookPurchase.js";
import SeatReservation from "../models/SeatReservation.js";
import PaymentRequest from "../models/PaymentRequest.js";
import LibrarySettings from "../models/LibrarySettings.js";

// ✅ File upload + path helpers
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

// ✅ Cloudflare R2 (via AWS SDK S3 client)
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

const router = express.Router();

/* -----------------------------------------------------------------------
   Proper __dirname for this file (so paths match server.js)
------------------------------------------------------------------------ */
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/* -----------------------------------------------------------------------
   Auth stubs (replace with real auth later)
------------------------------------------------------------------------ */
const requireAuth = (req, res, next) => {
  if (!req.user) {
    return res
      .status(401)
      .json({ success: false, message: "Unauthorized" });
  }
  next();
};

const requireAdmin = (req, res, next) => {
  if (!req.user?.isAdmin) {
    return res
      .status(403)
      .json({ success: false, message: "Admin only" });
  }
  next();
};

/* =======================================================================
   🔐 Cloudflare R2 Setup
   Uses your env vars from Render dashboard:
   - R2_ENABLED
   - R2_BUCKET
   - R2_ENDPOINT
   - R2_ACCESS_KEY_ID
   - R2_SECRET_ACCESS_KEY
   - R2_PUBLIC_BASE   (e.g. https://pub-xxxxx.r2.dev)
======================================================================= */

const R2_ENABLED =
  String(process.env.R2_ENABLED || "").toLowerCase() === "true";
const R2_BUCKET = process.env.R2_BUCKET || "";
const R2_ENDPOINT = process.env.R2_ENDPOINT || "";
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || "";
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || "";
const R2_PUBLIC_BASE = (process.env.R2_PUBLIC_BASE || "").replace(
  /\/+$/,
  ""
);

const R2_ACTIVE =
  R2_ENABLED &&
  R2_BUCKET &&
  R2_ENDPOINT &&
  R2_ACCESS_KEY_ID &&
  R2_SECRET_ACCESS_KEY &&
  R2_PUBLIC_BASE;

let r2Client = null;

if (R2_ACTIVE) {
  r2Client = new S3Client({
    region: "auto",
    endpoint: R2_ENDPOINT,
    credentials: {
      accessKeyId: R2_ACCESS_KEY_ID,
      secretAccessKey: R2_SECRET_ACCESS_KEY,
    },
  });
  console.log("[Library] R2 uploads ENABLED");
} else {
  console.log("[Library] R2 uploads DISABLED or misconfigured");
}

/**
 * Upload a file buffer to R2 under a given key and
 * return the public URL.
 */
async function uploadBufferToR2(buffer, key, contentType) {
  if (!r2Client) {
    throw new Error("R2 not configured");
  }

  const command = new PutObjectCommand({
    Bucket: R2_BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType || "application/octet-stream",
  });

  await r2Client.send(command);
  return `${R2_PUBLIC_BASE}/${key}`;
}

/* =======================================================================
   📂 Multer setup for book uploads (PDF + cover)
   Endpoint: POST /api/library/upload
======================================================================= */

// ✅ Ensure upload folder exists in the SAME place as server.js:
// root/uploads/library
const localLibraryDir = path.join(__dirname, "..", "uploads", "library");
if (!fs.existsSync(localLibraryDir)) {
  fs.mkdirSync(localLibraryDir, { recursive: true });
}

// We still use diskStorage so files exist even if R2 is disabled
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, localLibraryDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname);
    const base = path
      .basename(file.originalname, ext)
      .replace(/\s+/g, "_");
    cb(null, `${Date.now()}_${base}${ext}`);
  },
});

const upload = multer({
  storage,
  // You can adjust this if you want a hard per-file limit:
  // limits: { fileSize: 1024 * 1024 * 200 }, // 200 MB
});

/**
 * 📚 ADMIN (or general) upload book
 * Expects fields:
 *  - title (string, required)
 *  - author (string)
 *  - description (string)
 *  - free (boolean string "true"/"false")
 *  - price (number if paid)
 *  - pdf (file, required)
 *  - cover (file, required)
 */
router.post(
  "/upload",
  // you can add requireAdmin here later if your auth is wired:
  // requireAdmin,
  upload.fields([
    { name: "pdf", maxCount: 1 },
    { name: "cover", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      console.log("[Library] /upload body:", req.body);
      console.log("[Library] /upload files:", req.files);

      const { title, author, description, price, free } = req.body;

      if (!title || !req.files?.pdf?.length || !req.files?.cover?.length) {
        return res.json({
          success: false,
          message: "Title, PDF and cover are required",
        });
      }

      const pdfFile = req.files.pdf[0];
      const coverFile = req.files.cover[0];

      const isFree = String(free) === "true";
      const isPaid = !isFree;

      let pdfUrl;
      let coverUrl;

      // ----------------- Upload to R2 if active -----------------
      if (R2_ACTIVE) {
        try {
          const pdfKey = `library/pdf/${pdfFile.filename}`;
          const coverKey = `library/covers/${coverFile.filename}`;

          const [pdfBuffer, coverBuffer] = await Promise.all([
            fs.promises.readFile(pdfFile.path),
            fs.promises.readFile(coverFile.path),
          ]);

          const [pdfRemoteUrl, coverRemoteUrl] = await Promise.all([
            uploadBufferToR2(
              pdfBuffer,
              pdfKey,
              pdfFile.mimetype || "application/pdf"
            ),
            uploadBufferToR2(
              coverBuffer,
              coverKey,
              coverFile.mimetype || "image/jpeg"
            ),
          ]);

          pdfUrl = pdfRemoteUrl;
          coverUrl = coverRemoteUrl;

          // Clean up local temp files (optional)
          try {
            await fs.promises.unlink(pdfFile.path);
            await fs.promises.unlink(coverFile.path);
          } catch (cleanupErr) {
            console.warn(
              "[Library] Failed to delete temp files:",
              cleanupErr.message
            );
          }

          console.log("[Library] Uploaded to R2:", { pdfUrl, coverUrl });
        } catch (r2Err) {
          console.error("[Library] R2 upload failed, falling back:", r2Err);
          // Fall back to local /uploads if something is wrong with R2
          pdfUrl = `/uploads/library/${pdfFile.filename}`;
          coverUrl = `/uploads/library/${coverFile.filename}`;
        }
      } else {
        // ----------------- No R2, use local /uploads -----------------
        pdfUrl = `/uploads/library/${pdfFile.filename}`;
        coverUrl = `/uploads/library/${coverFile.filename}`;
      }

      const book = await LibraryBook.create({
        title,
        author,
        description,
        isPaid,
        price: isPaid ? Number(price) || 0 : 0,
        pdfUrl,
        coverUrl,
        isPublished: true, // default published so it shows in list
      });

      return res.json({
        success: true,
        data: book,
      });
    } catch (err) {
      console.error("[Library] POST /upload error:", err);
      // Keep HTTP 200 so frontend sees a JSON error, not fetch-throw
      return res.json({
        success: false,
        message: err?.message || "Failed to upload book",
      });
    }
  }
);

/* =======================================================================
   📚 PUBLIC: List published books (free + paid)
   GET /api/library/books
======================================================================= */
router.get("/books", async (req, res) => {
  try {
    const books = await LibraryBook.find({ isPublished: true }).sort({
      createdAt: 1,
    });
    res.json({ success: true, data: books });
  } catch (err) {
    console.error("[Library] GET /books error:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch books" });
  }
});

/* =======================================================================
   🔐 USER: Check if user can read a book (paid logic + seat logic)
   ⚠ IMPORTANT: This must be BEFORE `/books/:id` to avoid route clash.
   GET /api/library/books/:bookId/access
======================================================================= */
router.get("/books/:bookId/access", requireAuth, async (req, res) => {
  try {
    const book = await LibraryBook.findById(req.params.bookId);
    if (!book || !book.isPublished) {
      return res
        .status(404)
        .json({ success: false, message: "Book not found" });
    }

    const now = new Date();

    if (!book.isPaid) {
      // free book: no seat, no purchase needed
      return res.json({
        success: true,
        data: {
          canRead: true,
          reason: "free",
          seatRequired: false,
        },
      });
    }

    // Paid book → must have active purchase
    const purchase = await BookPurchase.findOne({
      userId: req.user._id,
      bookId: book._id,
      status: "active",
      readingExpiresAt: { $gt: now },
    });

    if (!purchase) {
      return res.json({
        success: true,
        data: {
          canRead: false,
          reason: "no_active_purchase",
        },
      });
    }

    // must also have active seat
    const seat = await SeatReservation.findOne({
      userId: req.user._id,
      status: "active",
      endsAt: { $gt: now },
    });

    if (!seat) {
      return res.json({
        success: true,
        data: {
          canRead: false,
          reason: "no_active_seat",
          purchaseExpiresAt: purchase.readingExpiresAt,
        },
      });
    }

    // ✅ both purchase and seat are valid
    res.json({
      success: true,
      data: {
        canRead: true,
        reason: "ok",
        seatEndsAt: seat.endsAt,
        purchaseExpiresAt: purchase.readingExpiresAt,
      },
    });
  } catch (err) {
    console.error("[Library] GET /books/:bookId/access error:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to check access" });
  }
});

/* =======================================================================
   📚 PUBLIC: Single book detail
   GET /api/library/books/:id
======================================================================= */
router.get("/books/:id", async (req, res) => {
  try {
    const book = await LibraryBook.findById(req.params.id);
    if (!book || !book.isPublished) {
      return res
        .status(404)
        .json({ success: false, message: "Book not found" });
    }
    res.json({ success: true, data: book });
  } catch (err) {
    console.error("[Library] GET /books/:id error:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch book" });
  }
});

/* =======================================================================
   🪑 USER: Create seat payment request (before screenshot)
   POST /api/library/seat/payment-request
======================================================================= */
router.post("/seat/payment-request", requireAuth, async (req, res) => {
  try {
    const { durationMinutes, amount } = req.body;
    if (!durationMinutes || !amount) {
      return res.status(400).json({
        success: false,
        message: "Missing duration/amount",
      });
    }

    const payment = await PaymentRequest.create({
      userId: req.user._id,
      type: "seat",
      seatDurationMinutes: durationMinutes,
      amount,
      status: "submitted", // screenshot to be attached in next step
    });

    res.status(201).json({ success: true, data: payment });
  } catch (err) {
    console.error("[Library] POST /seat/payment-request error:", err);
    res.status(400).json({
      success: false,
      message: "Failed to create payment request",
    });
  }
});

/* =======================================================================
   🖼️ USER: Attach screenshot + name/phone for payment
   (You will plug multer or similar here)
   POST /api/library/payment/:paymentId/submit
======================================================================= */
router.post(
  "/payment/:paymentId/submit",
  requireAuth,
  async (req, res) => {
    try {
      const { name, phone } = req.body;
      // TODO: handle file upload via multer, e.g. req.file.path
      const screenshotPath = req.body.screenshotPath || ""; // placeholder

      const payment = await PaymentRequest.findOne({
        _id: req.params.paymentId,
        userId: req.user._id,
      });
      if (!payment) {
        return res.status(404).json({
          success: false,
          message: "Payment request not found",
        });
      }

      payment.name = name;
      payment.phone = phone;
      payment.screenshotPath = screenshotPath;
      payment.status = "submitted";
      await payment.save();

      res.json({ success: true, data: payment });
    } catch (err) {
      console.error(
        "[Library] POST /payment/:paymentId/submit error:",
        err
      );
      res.status(400).json({
        success: false,
        message: "Failed to submit payment",
      });
    }
  }
);

/* =======================================================================
   🪑 ADMIN: Approve seat payment → create SeatReservation
   POST /api/library/admin/seat/approve/:paymentId
======================================================================= */
router.post(
  "/admin/seat/approve/:paymentId",
  requireAdmin,
  async (req, res) => {
    try {
      const payment = await PaymentRequest.findById(req.params.paymentId);
      if (!payment || payment.type !== "seat") {
        return res.status(404).json({
          success: false,
          message: "Seat payment not found",
        });
      }

      payment.status = "approved";
      await payment.save();

      // basic seat number logic: find smallest free seat
      const totalSeats = 50; // or load from settings
      const reservations = await SeatReservation.find({
        status: "active",
        endsAt: { $gt: new Date() },
      }).select("seatNumber");

      const usedSeatNumbers = new Set(
        reservations.map((r) => r.seatNumber)
      );
      let seatNumber = null;
      for (let i = 1; i <= totalSeats; i++) {
        if (!usedSeatNumbers.has(i)) {
          seatNumber = i;
          break;
        }
      }

      if (!seatNumber) {
        return res.status(400).json({
          success: false,
          message: "No seats available at the moment",
        });
      }

      const now = new Date();
      const durationMinutes = payment.seatDurationMinutes;
      const endsAt = new Date(now.getTime() + durationMinutes * 60 * 1000);

      const reservation = await SeatReservation.create({
        userId: payment.userId,
        seatNumber,
        durationMinutes,
        startsAt: now,
        endsAt,
        status: "active",
        paymentId: payment._id,
      });

      res.json({ success: true, data: reservation });
    } catch (err) {
      console.error("[Library] POST /admin/seat/approve error:", err);
      res.status(400).json({
        success: false,
        message: "Failed to approve seat",
      });
    }
  }
);

/* =======================================================================
   📖 USER: Create payment for paid book
   POST /api/library/book/payment-request
   body: { bookId, amount } (amount decided from UI/admin)
======================================================================= */
router.post(
  "/book/payment-request",
  requireAuth,
  async (req, res) => {
    try {
      const { bookId, amount } = req.body;
      if (!bookId || !amount) {
        return res.status(400).json({
          success: false,
          message: "Missing bookId/amount",
        });
      }

      const book = await LibraryBook.findById(bookId);
      if (!book || !book.isPublished || !book.isPaid) {
        return res.status(404).json({
          success: false,
          message: "Paid book not found",
        });
      }

      const payment = await PaymentRequest.create({
        userId: req.user._id,
        type: "book",
        bookId,
        amount,
        status: "submitted",
      });

      res.status(201).json({ success: true, data: payment });
    } catch (err) {
      console.error(
        "[Library] POST /book/payment-request error:",
        err
      );
      res.status(400).json({
        success: false,
        message: "Failed to create book payment",
      });
    }
  }
);

/* =======================================================================
   📖 ADMIN: Approve paid book payment → create BookPurchase
   POST /api/library/admin/book/approve/:paymentId
======================================================================= */
router.post(
  "/admin/book/approve/:paymentId",
  requireAdmin,
  async (req, res) => {
    try {
      const payment = await PaymentRequest.findById(req.params.paymentId);
      if (!payment || payment.type !== "book") {
        return res.status(404).json({
          success: false,
          message: "Book payment not found",
        });
      }

      const book = await LibraryBook.findById(payment.bookId);
      if (!book) {
        return res
          .status(404)
          .json({ success: false, message: "Book not found" });
      }

      payment.status = "approved";
      await payment.save();

      const now = new Date();
      const readingHours = book.defaultReadingHours || 24;
      const expiresAt = new Date(
        now.getTime() + readingHours * 60 * 60 * 1000
      );

      const purchase = await BookPurchase.create({
        userId: payment.userId,
        bookId: book._id,
        readingHours,
        readingStartsAt: now,
        readingExpiresAt: expiresAt,
        status: "active",
        paymentId: payment._id,
      });

      res.json({ success: true, data: purchase });
    } catch (err) {
      console.error("[Library] POST /admin/book/approve error:", err);
      res.status(400).json({
        success: false,
        message: "Failed to approve book purchase",
      });
    }
  }
);

/* =======================================================================
   🗑️ DELETE BOOK (used by BooksPage.jsx → getJSON("/api/library/delete/:id"))
   GET /api/library/delete/:id
======================================================================= */
router.get("/delete/:id", async (req, res) => {
  try {
    const book = await LibraryBook.findById(req.params.id);
    if (!book) {
      return res.json({ success: false, message: "Book not found" });
    }

    await LibraryBook.findByIdAndDelete(req.params.id);

    return res.json({ success: true, message: "Book deleted" });
  } catch (err) {
    console.error("[Library] GET /delete/:id error:", err);
    return res.json({
      success: false,
      message: "Failed to delete book",
    });
  }
});

export default router;
