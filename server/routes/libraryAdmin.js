import express from "express";
import PaymentRequest from "../models/PaymentRequest.js";
import SeatReservation from "../models/SeatReservation.js";
import BookPurchase from "../models/BookPurchase.js";
import LibraryBook from "../models/LibraryBook.js";
import LibrarySettings from "../models/LibrarySettings.js";

const router = express.Router();

/* ============================================================
   🔐 ADMIN MIDDLEWARE – USES x-owner-key EXACTLY AS YOU SET
============================================================ */
const requireAdmin = (req, res, next) => {
  const headerKey =
    req.headers["x-owner-key"] ||
    req.headers["x-admin-token"] ||
    req.headers["X-Owner-Key"];

  const serverKey =
    process.env.VITE_OWNER_KEY ||
    process.env.ADMIN_PANEL_KEY ||
    process.env.ADMIN_SHARED_SECRET;

  if (headerKey && serverKey && headerKey === serverKey) {
    req.user = req.user || {};
    req.user.isAdmin = true;
    return next();
  }

  return res.status(403).json({ success: false, message: "Admin only" });
};

/* ------------------------------------------------------------
   Ensure Settings Document Exists
------------------------------------------------------------ */
async function ensureSettings() {
  let settings = await LibrarySettings.findOne();
  if (!settings) settings = await LibrarySettings.create({});
  return settings;
}

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

    const isFree = free === true || free === "true";

    const book = await LibraryBook.create({
      title,
      author,
      description,
      isPaid: !isFree,
      basePrice: isFree ? 0 : Number(price) || 0,
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
   📚 ADMIN: DELETE BOOK
   GET /api/admin/library/delete/:id
============================================================ */
router.get("/delete/:id", requireAdmin, async (req, res) => {
  try {
    await LibraryBook.findByIdAndDelete(req.params.id);
    return res.json({ success: true, message: "Deleted" });
  } catch (err) {
    console.error("[Admin] delete book error:", err);
    return res.status(500).json({
      success: false,
      message: "Delete failed",
    });
  }
});

/* ============================================================
   💰 LIST ALL SUBMITTED PAYMENTS
   GET /api/admin/library/payments
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
    return res
      .status(500)
      .json({ success: false, message: "Failed to load payments" });
  }
});

/* ============================================================
   ❌ REJECT PAYMENT
   POST /api/admin/library/payments/reject/:paymentId
============================================================ */
router.post("/payments/reject/:paymentId", requireAdmin, async (req, res) => {
  try {
    const payment = await PaymentRequest.findById(req.params.paymentId);
    if (!payment) {
      return res
        .status(404)
        .json({ success: false, message: "Payment not found" });
    }

    payment.status = "rejected";
    await payment.save();

    return res.json({ success: true, message: "Payment rejected" });
  } catch (err) {
    console.error("[Admin] reject error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to reject payment",
    });
  }
});

/* ============================================================
   💺 APPROVE SEAT PAYMENT
   POST /api/admin/library/seat/approve/:paymentId
============================================================ */
router.post("/seat/approve/:paymentId", requireAdmin, async (req, res) => {
  try {
    const payment = await PaymentRequest.findById(req.params.paymentId);

    if (!payment || payment.type !== "seat") {
      return res.status(404).json({
        success: false,
        message: "Seat payment not found",
      });
    }

    const now = new Date();
    const totalSeats = 50;

    const activeSeats = await SeatReservation.find({
      status: "active",
      endsAt: { $gt: now },
    });

    const used = new Set(activeSeats.map((s) => s.seatNumber));

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

    return res.json({ success: true, data: reservation });
  } catch (err) {
    console.error("[Admin] approve seat error:", err);
    return res.status(500).json({
      success: false,
      message: "Failed to approve seat",
    });
  }
});

/* ============================================================
   📖 APPROVE BOOK PAYMENT
   POST /api/admin/library/book/approve/:paymentId
============================================================ */
router.post("/book/approve/:paymentId", requireAdmin, async (req, res) => {
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
      return res.status(404).json({
        success: false,
        message: "Book not found",
      });
    }

    const settings = await ensureSettings();

    const now = new Date();
    const hours =
      book.defaultReadingHours ||
      settings.defaultReadingHours ||
      24;

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
    return res.status(500).json({
      success: false,
      message: "Failed to approve book",
    });
  }
});

export default router;
