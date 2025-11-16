// routes/library.js
import express from "express";
import LibraryBook from "../models/LibraryBook.js";
import BookPurchase from "../models/BookPurchase.js";
import SeatReservation from "../models/SeatReservation.js";
import PaymentRequest from "../models/PaymentRequest.js";
import LibrarySettings from "../models/LibrarySettings.js";

const router = express.Router();

// TODO: use your real auth middleware
// e.g. import { requireAuth, requireAdmin } from "../middleware/auth.js";
const requireAuth = (req, res, next) => {
  if (!req.user) return res.status(401).json({ success: false, message: "Unauthorized" });
  next();
};
const requireAdmin = (req, res, next) => {
  if (!req.user?.isAdmin)
    return res.status(403).json({ success: false, message: "Admin only" });
  next();
};

/* =======================================================================
   📚 PUBLIC: List published books (free + paid)
   GET /api/library/books
======================================================================= */
router.get("/books", async (req, res) => {
  try {
    const books = await LibraryBook.find({ isPublished: true }).sort({ createdAt: 1 });
    res.json({ success: true, data: books });
  } catch (err) {
    console.error("[Library] GET /books error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch books" });
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
      return res.status(404).json({ success: false, message: "Book not found" });
    }
    res.json({ success: true, data: book });
  } catch (err) {
    console.error("[Library] GET /books/:id error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch book" });
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
      return res.status(400).json({ success: false, message: "Missing duration/amount" });
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
    res.status(400).json({ success: false, message: "Failed to create payment request" });
  }
});

/* =======================================================================
   🖼️ USER: Attach screenshot + name/phone for payment
   (You will plug multer or similar here)
   POST /api/library/payment/:paymentId/submit
======================================================================= */
router.post("/payment/:paymentId/submit", requireAuth, async (req, res) => {
  try {
    const { name, phone } = req.body;
    // TODO: handle file upload via multer, e.g. req.file.path
    const screenshotPath = req.body.screenshotPath || ""; // placeholder

    const payment = await PaymentRequest.findOne({
      _id: req.params.paymentId,
      userId: req.user._id,
    });
    if (!payment) {
      return res.status(404).json({ success: false, message: "Payment request not found" });
    }

    payment.name = name;
    payment.phone = phone;
    payment.screenshotPath = screenshotPath;
    payment.status = "submitted";
    await payment.save();

    res.json({ success: true, data: payment });
  } catch (err) {
    console.error("[Library] POST /payment/:paymentId/submit error:", err);
    res.status(400).json({ success: false, message: "Failed to submit payment" });
  }
});

/* =======================================================================
   🪑 ADMIN: Approve seat payment → create SeatReservation
   POST /api/library/admin/seat/approve/:paymentId
======================================================================= */
router.post("/admin/seat/approve/:paymentId", requireAdmin, async (req, res) => {
  try {
    const payment = await PaymentRequest.findById(req.params.paymentId);
    if (!payment || payment.type !== "seat") {
      return res.status(404).json({ success: false, message: "Seat payment not found" });
    }

    payment.status = "approved";
    await payment.save();

    // basic seat number logic: find smallest free seat
    const totalSeats = 50; // or load from settings
    const reservations = await SeatReservation.find({
      status: "active",
      endsAt: { $gt: new Date() },
    }).select("seatNumber");

    const usedSeatNumbers = new Set(reservations.map((r) => r.seatNumber));
    let seatNumber = null;
    for (let i = 1; i <= totalSeats; i++) {
      if (!usedSeatNumbers.has(i)) {
        seatNumber = i;
        break;
      }
    }

    if (!seatNumber) {
      return res
        .status(400)
        .json({ success: false, message: "No seats available at the moment" });
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
    res.status(400).json({ success: false, message: "Failed to approve seat" });
  }
});

/* =======================================================================
   📖 USER: Create payment for paid book
   POST /api/library/book/payment-request
   body: { bookId, amount } (amount decided from UI/admin)
======================================================================= */
router.post("/book/payment-request", requireAuth, async (req, res) => {
  try {
    const { bookId, amount } = req.body;
    if (!bookId || !amount) {
      return res.status(400).json({ success: false, message: "Missing bookId/amount" });
    }

    const book = await LibraryBook.findById(bookId);
    if (!book || !book.isPublished || !book.isPaid) {
      return res.status(404).json({ success: false, message: "Paid book not found" });
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
    console.error("[Library] POST /book/payment-request error:", err);
    res.status(400).json({ success: false, message: "Failed to create book payment" });
  }
});

/* =======================================================================
   📖 ADMIN: Approve paid book payment → create BookPurchase
   POST /api/library/admin/book/approve/:paymentId
======================================================================= */
router.post("/admin/book/approve/:paymentId", requireAdmin, async (req, res) => {
  try {
    const payment = await PaymentRequest.findById(req.params.paymentId);
    if (!payment || payment.type !== "book") {
      return res.status(404).json({ success: false, message: "Book payment not found" });
    }

    const book = await LibraryBook.findById(payment.bookId);
    if (!book) {
      return res.status(404).json({ success: false, message: "Book not found" });
    }

    payment.status = "approved";
    await payment.save();

    const now = new Date();
    const readingHours = book.defaultReadingHours || 24;
    const expiresAt = new Date(now.getTime() + readingHours * 60 * 60 * 1000);

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
    res.status(400).json({ success: false, message: "Failed to approve book purchase" });
  }
});

/* =======================================================================
   🔐 USER: Check if user can read a book (paid logic + seat logic)
   GET /api/library/books/:bookId/access
======================================================================= */
router.get("/books/:bookId/access", requireAuth, async (req, res) => {
  try {
    const book = await LibraryBook.findById(req.params.bookId);
    if (!book || !book.isPublished) {
      return res.status(404).json({ success: false, message: "Book not found" });
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
    res.status(500).json({ success: false, message: "Failed to check access" });
  }
});

export default router;
