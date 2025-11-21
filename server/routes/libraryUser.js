import express from "express";
import LibraryBook from "../models/LibraryBook.js";
import BookPurchase from "../models/BookPurchase.js";
import SeatReservation from "../models/SeatReservation.js";
import PaymentRequest from "../models/PaymentRequest.js";
import LibrarySettings from "../models/LibrarySettings.js";
import uploadPayment from "../middlewares/uploadPayment.js"; // ✔ screenshot middleware

const router = express.Router();

/* ============================================================
   🔐 USER AUTH (required for payments, access check, etc.)
============================================================ */
const requireAuth = (req, res, next) => {
  if (!req.user) {
    return res
      .status(401)
      .json({ success: false, message: "Unauthorized" });
  }
  next();
};

/* ============================================================
   Ensure settings exists
============================================================ */
async function ensureSettings() {
  let s = await LibrarySettings.findOne();
  if (!s) s = await LibrarySettings.create({});
  return s;
}

/* ============================================================
   📚 GET ALL BOOKS  (public)
   GET /api/library/books
============================================================ */
router.get("/books", async (_req, res) => {
  try {
    const books = await LibraryBook.find({ isPublished: true }).sort({
      createdAt: 1,
    });

    return res.json({ success: true, data: books });
  } catch (err) {
    console.error("[User Library] GET /books error:", err);
    return res.json({
      success: false,
      message: "Failed to fetch books",
    });
  }
});

/* ============================================================
   📘 GET SINGLE BOOK (public)
   GET /api/library/books/:id
============================================================ */
router.get("/books/:id", async (req, res) => {
  try {
    const book = await LibraryBook.findById(req.params.id);

    if (!book || !book.isPublished) {
      return res
        .status(404)
        .json({ success: false, message: "Book not found" });
    }

    return res.json({ success: true, data: book });
  } catch (err) {
    console.error("[User Library] GET book error:", err);
    return res.json({
      success: false,
      message: "Failed to fetch book",
    });
  }
});

/* ============================================================
   🧾 CREATE PAYMENT REQUEST (SEAT)
   POST /api/library/seat/payment-request
============================================================ */
router.post("/seat/payment-request", requireAuth, async (req, res) => {
  try {
    const { durationMinutes } = req.body;

    if (!durationMinutes) {
      return res.json({
        success: false,
        message: "durationMinutes required",
      });
    }

    const settings = await ensureSettings();
    const amount = settings.seatBasePrice || 50;

    const payment = await PaymentRequest.create({
      userId: req.user._id,
      type: "seat",
      seatDurationMinutes: durationMinutes,
      amount,
      status: "submitted",
    });

    return res.json({ success: true, data: payment });
  } catch (err) {
    console.error("[User Library] Seat payment error:", err);
    return res.json({
      success: false,
      message: "Failed to create seat payment",
    });
  }
});

/* ============================================================
   📖 CREATE PAYMENT REQUEST (BOOK)
   POST /api/library/book/payment-request
============================================================ */
router.post("/book/payment-request", requireAuth, async (req, res) => {
  try {
    const { bookId } = req.body;

    if (!bookId) {
      return res.json({
        success: false,
        message: "bookId required",
      });
    }

    const book = await LibraryBook.findById(bookId);

    if (!book || !book.isPublished || !book.isPaid) {
      return res.json({
        success: false,
        message: "Paid book not found",
      });
    }

    const payment = await PaymentRequest.create({
      userId: req.user._id,
      type: "book",
      bookId,
      amount: book.basePrice,
      status: "submitted",
    });

    return res.json({ success: true, data: payment });
  } catch (err) {
    console.error("[User Library] Book payment error:", err);
    return res.json({
      success: false,
      message: "Failed to create payment",
    });
  }
});

/* ============================================================
   📤 SUBMIT PAYMENT SCREENSHOT
   POST /api/library/payment/:paymentId/submit
============================================================ */
router.post(
  "/payment/:paymentId/submit",
  requireAuth,
  uploadPayment.single("screenshot"), // ✔ screenshot upload
  async (req, res) => {
    try {
      const { name, phone } = req.body;

      const payment = await PaymentRequest.findOne({
        _id: req.params.paymentId,
        userId: req.user._id,
      });

      if (!payment) {
        return res.json({
          success: false,
          message: "Payment not found",
        });
      }

      // attach screenshot
      if (req.file) {
        payment.screenshotPath =
          "/uploads/payments/" + req.file.filename;
      }

      payment.name = name;
      payment.phone = phone;
      payment.status = "submitted";
      await payment.save();

      const settings = await ensureSettings();

      // Auto Approve
      if (payment.type === "seat" && settings.autoApproveSeat) {
        await autoApproveSeat(payment, settings);
      }

      if (payment.type === "book" && settings.autoApproveBook) {
        await autoApproveBook(payment, settings);
      }

      return res.json({ success: true, data: payment });
    } catch (err) {
      console.error("[Payment Submit] error:", err);
      return res.json({
        success: false,
        message: "Failed to submit payment",
      });
    }
  }
);

/* ============================================================
   AUTO APPROVE: SEAT
============================================================ */
async function autoApproveSeat(payment, settings) {
  const now = new Date();
  const totalSeats = 50;

  const active = await SeatReservation.find({
    status: "active",
    endsAt: { $gt: now },
  });

  const used = new Set(active.map((s) => s.seatNumber));

  let seatNum = null;
  for (let i = 1; i <= totalSeats; i++) {
    if (!used.has(i)) {
      seatNum = i;
      break;
    }
  }

  if (!seatNum) return;

  const duration = payment.seatDurationMinutes || 60;
  const endsAt = new Date(now.getTime() + duration * 60 * 1000);

  await SeatReservation.create({
    userId: payment.userId,
    seatNumber: seatNum,
    durationMinutes: duration,
    startsAt: now,
    endsAt,
    status: "active",
    paymentId: payment._id,
  });

  payment.status = "approved";
  await payment.save();
}

/* ============================================================
   AUTO APPROVE: BOOK
============================================================ */
async function autoApproveBook(payment, settings) {
  const book = await LibraryBook.findById(payment.bookId);
  if (!book) return;

  const now = new Date();
  const hours =
    book.defaultReadingHours || settings.defaultReadingHours || 24;

  const expiresAt = new Date(now.getTime() + hours * 3600000);

  await BookPurchase.create({
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
}

/* ============================================================
   GET USER PURCHASES
============================================================ */
router.get("/my/purchases", requireAuth, async (req, res) => {
  try {
    const now = new Date();

    const purchases = await BookPurchase.find({
      userId: req.user._id,
      status: "active",
      readingExpiresAt: { $gt: now },
    }).populate("bookId");

    return res.json({ success: true, data: purchases });
  } catch (err) {
    console.error("[User Library] GET /my/purchases error:", err);
    return res.json({
      success: false,
      message: "Failed to fetch purchases",
    });
  }
});

/* ============================================================
   CHECK BOOK READ ACCESS
============================================================ */
router.get("/books/:bookId/access", requireAuth, async (req, res) => {
  try {
    const book = await LibraryBook.findById(req.params.bookId);
    if (!book || !book.isPublished) {
      return res.json({
        success: false,
        message: "Book not found",
      });
    }

    const now = new Date();

    // Free book = always readable
    if (!book.isPaid) {
      return res.json({
        success: true,
        data: { canRead: true, reason: "free" },
      });
    }

    const purchase = await BookPurchase.findOne({
      userId: req.user._id,
      bookId: book._id,
      status: "active",
      readingExpiresAt: { $gt: now },
    });

    if (!purchase) {
      return res.json({
        success: true,
        data: { canRead: false, reason: "no_active_purchase" },
      });
    }

    const seat = await SeatReservation.findOne({
      userId: req.user._id,
      status: "active",
      endsAt: { $gt: now },
    });

    if (!seat) {
      return res.json({
        success: true,
        data: { canRead: false, reason: "no_active_seat" },
      });
    }

    return res.json({
      success: true,
      data: {
        canRead: true,
        reason: "ok",
        seatEndsAt: seat.endsAt,
        purchaseExpiresAt: purchase.readingExpiresAt,
      },
    });
  } catch (err) {
    console.error("[User Library] GET access error:", err);
    return res.json({
      success: false,
      message: "Failed to check access",
    });
  }
});

export default router;
