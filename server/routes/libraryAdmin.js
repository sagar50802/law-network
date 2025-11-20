// routes/libraryAdmin.js
import express from "express";
import PaymentRequest from "../models/PaymentRequest.js";
import SeatReservation from "../models/SeatReservation.js";
import BookPurchase from "../models/BookPurchase.js";
import LibraryBook from "../models/LibraryBook.js";
import LibrarySettings from "../models/LibrarySettings.js";

const router = express.Router();

/* ============================================================
   🔐 ADMIN MIDDLEWARE (COOKIE REQUIRED)
============================================================ */
const requireAdmin = (req, res, next) => {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).json({ success: false, message: "Admin only" });
  }
  next();
};

/* ============================================================
   ⭐ ADMIN: CREATE BOOK
   POST /api/admin/library/create
============================================================ */
router.post("/create", requireAdmin, async (req, res) => {
  try {
    const { title, author, description, free, price, pdfUrl, coverUrl } =
      req.body;

    if (!title || !pdfUrl || !coverUrl) {
      return res.status(400).json({
        success: false,
        message: "title, pdfUrl and coverUrl are required",
      });
    }

    const book = await LibraryBook.create({
      title,
      author,
      description,
      isPaid: !free,
      basePrice: free ? 0 : Number(price) || 0,
      pdfUrl,
      coverUrl,
      isPublished: true,
    });

    return res.json({ success: true, data: book });
  } catch (err) {
    console.error("[Admin] CREATE BOOK error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to create book",
    });
  }
});

/* ============================================================
   💰 PAYMENT REQUEST LIST
============================================================ */
router.get("/payments", requireAdmin, async (_req, res) => {
  try {
    const payments = await PaymentRequest.find({
      status: "submitted",
    })
      .sort({ createdAt: -1 })
      .lean();

    return res.json({ success: true, data: payments });
  } catch (err) {
    console.error("[Admin] GET payments error:", err);
    return res.status(500).json({ success: false });
  }
});

/* ============================================================
   💰 REJECT PAYMENT
============================================================ */
router.post("/payments/reject/:paymentId", requireAdmin, async (req, res) => {
  try {
    const payment = await PaymentRequest.findById(req.params.paymentId);
    if (!payment)
      return res.status(404).json({ success: false, message: "Payment not found" });

    payment.status = "rejected";
    await payment.save();

    return res.json({ success: true });
  } catch (err) {
    console.error("[Admin] reject error:", err);
    return res.status(500).json({ success: false });
  }
});

/* ============================================================
   💺 APPROVE SEAT PAYMENT
============================================================ */
router.post("/seat/approve/:paymentId", requireAdmin, async (req, res) => {
  try {
    const payment = await PaymentRequest.findById(req.params.paymentId);
    if (!payment || payment.type !== "seat") {
      return res.status(404).json({ success: false, message: "Seat payment not found" });
    }

    const now = new Date();
    const totalSeats = 50;

    const active = await SeatReservation.find({
      status: "active",
      endsAt: { $gt: now },
    });

    const used = new Set(active.map((s) => s.seatNumber));

    let seatNumber = null;
    for (let i = 1; i <= totalSeats; i++) {
      if (!used.has(i)) {
        seatNumber = i;
        break;
      }
    }

    if (!seatNumber) {
      return res.status(400).json({ success: false, message: "No seats available" });
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

    return res.json({ success: true, data: reservation });
  } catch (err) {
    console.error("[Admin] approve seat error:", err);
    return res.status(500).json({ success: false });
  }
});

/* ============================================================
   📖 APPROVE BOOK PAYMENT
============================================================ */
router.post("/book/approve/:paymentId", requireAdmin, async (req, res) => {
  try {
    const payment = await PaymentRequest.findById(req.params.paymentId);
    if (!payment || payment.type !== "book") {
      return res.status(404).json({ success: false, message: "Payment not found" });
    }

    const book = await LibraryBook.findById(payment.bookId);
    if (!book) return res.status(404).json({ success: false, message: "Book not found" });

    const settings = await LibrarySettings.findOne() || await LibrarySettings.create({});

    const now = new Date();
    const hours = book.defaultReadingHours || settings.defaultReadingHours || 24;

    const expiresAt = new Date(now.getTime() + hours * 3600000);

    const purchase = await BookPurchase.create({
      userId: payment.userId,
      bookId: book._id,
      readingHours: hours,
      readingStartsAt: now,
      readingExpiresAt: expiresAt,
      status: "active",
      paymentId: payment._id,
    });

    payment.status = "approved";
    await payment.save();

    return res.json({ success: true, data: purchase });
  } catch (err) {
    console.error("[Admin] approve book error:", err);
    return res.status(500).json({ success: false });
  }
});

/* ============================================================
   📚 DELETE BOOK
============================================================ */
router.get("/delete/:id", requireAdmin, async (req, res) => {
  try {
    await LibraryBook.findByIdAndDelete(req.params.id);
    return res.json({ success: true });
  } catch (err) {
    return res.status(500).json({ success: false, message: "Delete failed" });
  }
});

export default router;
