// routes/libraryAdmin.js
import express from "express";
import PaymentRequest from "../models/PaymentRequest.js";
import SeatReservation from "../models/SeatReservation.js";
import BookPurchase from "../models/BookPurchase.js";
import LibraryBook from "../models/LibraryBook.js";
import LibrarySettings from "../models/LibrarySettings.js";

const router = express.Router();

/* ============================================================
   🔐 Admin Middleware (your original — untouched)
============================================================ */
const requireAdmin = (req, res, next) => {
  if (!req.user || !req.user.isAdmin) {
    return res
      .status(403)
      .json({ success: false, message: "Admin only" });
  }
  next();
};

/* ============================================================
   ⚙ Settings Helper (unchanged)
============================================================ */
async function ensureSettings() {
  let settings = await LibrarySettings.findOne();
  if (!settings) settings = await LibrarySettings.create({});
  return settings;
}

/* ============================================================
   ✅ NEW: Multer Upload Setup
============================================================ */
import multer from "multer";
import path from "path";
import fs from "fs";

// Ensure uploads/library exists
const uploadDir = path.join(process.cwd(), "uploads/library");
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) =>
    cb(null, Date.now() + "_" + file.originalname.replace(/\s+/g, "_")),
});

const upload = multer({ storage });

/* ============================================================
   📚 ✅ NEW ADMIN PDF + COVER UPLOAD
   POST /api/admin/library/upload
============================================================ */
router.post(
  "/upload",
  requireAdmin,
  upload.fields([
    { name: "pdf", maxCount: 1 },
    { name: "cover", maxCount: 1 },
  ]),
  async (req, res) => {
    try {
      const { title, author, description, free, price } = req.body;

      if (!title || !req.files?.pdf?.length || !req.files?.cover?.length) {
        return res.status(400).json({
          success: false,
          message: "Title, PDF, and Cover image are required",
        });
      }

      const pdf = req.files.pdf[0].filename;
      const cover = req.files.cover[0].filename;

      const isFree = String(free) === "true";
      const isPaid = !isFree;

      const book = await LibraryBook.create({
        title,
        author,
        description,
        isPaid,
        price: isPaid ? Number(price || 0) : 0,
        pdfUrl: "/uploads/library/" + pdf,
        coverUrl: "/uploads/library/" + cover,
        isPublished: true,
      });

      return res.json({ success: true, data: book });
    } catch (err) {
      console.error("📚 [Admin Upload Error]:", err);
      res.status(500).json({
        success: false,
        message: "Failed to upload book",
      });
    }
  }
);

/* ============================================================
   💰 GET /api/admin/library/payments (unchanged)
============================================================ */
router.get("/payments", requireAdmin, async (req, res) => {
  try {
    const payments = await PaymentRequest.find({
      status: "submitted",
    })
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, data: payments });
  } catch (err) {
    console.error("[Admin] GET /payments error:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to load payments" });
  }
});

/* ============================================================
   💰 Reject payment (unchanged)
============================================================ */
router.post(
  "/payments/reject/:paymentId",
  requireAdmin,
  async (req, res) => {
    try {
      const payment = await PaymentRequest.findById(req.params.paymentId);
      if (!payment) {
        return res
          .status(404)
          .json({ success: false, message: "Payment not found" });
      }

      payment.status = "rejected";
      await payment.save();

      res.json({ success: true, message: "Payment rejected" });
    } catch (err) {
      console.error("[Admin] reject error:", err);
      res
        .status(500)
        .json({ success: false, message: "Failed to reject payment" });
    }
  }
);

/* ============================================================
   💺 Seat approval (unchanged)
============================================================ */
router.post(
  "/seat/approve/:paymentId",
  requireAdmin,
  async (req, res) => {
    try {
      const payment = await PaymentRequest.findById(req.params.paymentId);
      if (!payment || payment.type !== "seat") {
        return res
          .status(404)
          .json({ success: false, message: "Seat payment not found" });
      }

      const now = new Date();
      const totalSeats = 50;
      const active = await SeatReservation.find({
        status: "active",
        endsAt: { $gt: now },
      }).select("seatNumber");

      const used = new Set(active.map((s) => s.seatNumber));
      let seatNumber = null;

      for (let i = 1; i <= totalSeats; i++) {
        if (!used.has(i)) {
          seatNumber = i;
          break;
        }
      }

      if (!seatNumber) {
        return res.status(400).json({
          success: false,
          message: "No seats available",
        });
      }

      const durationMinutes = payment.seatDurationMinutes || 60;
      const endsAt = new Date(now.getTime() + durationMinutes * 60000);

      const reservation = await SeatReservation.create({
        userId: payment.userId,
        seatNumber,
        durationMinutes,
        startsAt: now,
        endsAt,
        status: "active",
        paymentId: payment._id,
      });

      payment.status = "approved";
      await payment.save();

      res.json({ success: true, data: reservation });
    } catch (err) {
      console.error("[Admin] approve seat error:", err);
      res.status(500).json({
        success: false,
        message: "Failed to approve seat",
      });
    }
  }
);

/* ============================================================
   📖 Approve Paid Book (unchanged)
============================================================ */
router.post(
  "/book/approve/:paymentId",
  requireAdmin,
  async (req, res) => {
    try {
      const payment = await PaymentRequest.findById(req.params.paymentId);
      if (!payment || payment.type !== "book") {
        return res
          .status(404)
          .json({ success: false, message: "Book payment not found" });
      }

      const book = await LibraryBook.findById(payment.bookId);
      if (!book) {
        return res
          .status(404)
          .json({ success: false, message: "Book not found" });
      }

      const settings = await ensureSettings();

      const now = new Date();
      const readingHours =
        book.defaultReadingHours || settings.defaultReadingHours || 24;

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

      payment.status = "approved";
      await payment.save();

      res.json({ success: true, data: purchase });
    } catch (err) {
      console.error("[Admin] approve book error:", err);
      res
        .status(500)
        .json({ success: false, message: "Failed to approve book" });
    }
  }
);

/* ============================================================
   💺 List Active Seats (unchanged)
============================================================ */
router.get("/seats", requireAdmin, async (req, res) => {
  try {
    const now = new Date();
    const seats = await SeatReservation.find({
      status: "active",
      endsAt: { $gt: now },
    })
      .populate("userId", "name phone email")
      .sort({ seatNumber: 1 });

    res.json({ success: true, data: seats });
  } catch (err) {
    console.error("[Admin] GET /seats error:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to load seats" });
  }
});

/* ============================================================
   📚 List Book Purchases (unchanged)
============================================================ */
router.get("/book-purchases", requireAdmin, async (req, res) => {
  try {
    const purchases = await BookPurchase.find({})
      .populate("bookId", "title subject")
      .populate("userId", "name phone email")
      .sort({ createdAt: -1 });

    res.json({ success: true, data: purchases });
  } catch (err) {
    console.error("[Admin] GET /book-purchases error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to load book purchases",
    });
  }
});

/* ============================================================
   📚 Revoke Access (unchanged)
============================================================ */
router.post(
  "/book-purchases/revoke/:purchaseId",
  requireAdmin,
  async (req, res) => {
    try {
      const purchase = await BookPurchase.findById(req.params.purchaseId);
      if (!purchase) {
        return res
          .status(404)
          .json({ success: false, message: "Purchase not found" });
      }

      purchase.status = "expired";
      purchase.readingExpiresAt = new Date();
      await purchase.save();

      res.json({ success: true, message: "Access revoked" });
    } catch (err) {
      console.error("[Admin] revoke access error:", err);
      res.status(500).json({
        success: false,
        message: "Failed to revoke access",
      });
    }
  }
);

export default router;
