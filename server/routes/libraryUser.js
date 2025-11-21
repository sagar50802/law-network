// routes/libraryUser.js
import express from "express";
import LibraryBook from "../models/LibraryBook.js";
import BookPurchase from "../models/BookPurchase.js";
import SeatReservation from "../models/SeatReservation.js";
import PaymentRequest from "../models/PaymentRequest.js";
import LibrarySettings from "../models/LibrarySettings.js";

import multer from "multer";
import uploadPayment from "../middlewares/uploadPayment.js";

const router = express.Router();

/* -------------------------------------------------------------------------- */
/* AUTH MIDDLEWARE                                                            */
/* -------------------------------------------------------------------------- */
const requireAuth = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: "Unauthorized" });
  }
  next();
};

/* legacy screenshot upload */
const storage = multer.diskStorage({
  destination: "uploads/payments/",
  filename: (req, file, cb) => cb(null, Date.now() + "-" + file.originalname)
});
const uploadScreenshot = multer({ storage });

/* -------------------------------------------------------------------------- */
/* Ensure settings exists                                                     */
/* -------------------------------------------------------------------------- */
async function ensureSettings() {
  let settings = await LibrarySettings.findOne();
  if (!settings) settings = await LibrarySettings.create({});
  return settings;
}

/* -------------------------------------------------------------------------- */
/* 🧾 GET /api/library/payment/:paymentId                                     */
/* -------------------------------------------------------------------------- */
router.get("/payment/:paymentId", requireAuth, async (req, res) => {
  try {
    const payment = await PaymentRequest.findOne({
      _id: req.params.paymentId,
      userId: req.user._id
    });

    if (!payment)
      return res.status(404).json({ success: false, message: "Payment not found" });

    res.json({ success: true, data: payment });
  } catch (err) {
    console.error("[Library] GET /payment/:id error:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

/* -------------------------------------------------------------------------- */
/* 🪑 GET seat status                                                         */
/* -------------------------------------------------------------------------- */
router.get("/seat/status", requireAuth, async (req, res) => {
  try {
    const now = new Date();
    const seat = await SeatReservation.findOne({
      userId: req.user._id,
      status: "active",
      endsAt: { $gt: now }
    });

    if (!seat) {
      return res.json({
        success: true,
        data: { hasActiveSeat: false, seatEndsAt: null }
      });
    }

    res.json({
      success: true,
      data: {
        hasActiveSeat: true,
        seatEndsAt: seat.endsAt,
        seatNumber: seat.seatNumber
      }
    });
  } catch (err) {
    console.error("[Library] GET /seat/status error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch seat status" });
  }
});

/* -------------------------------------------------------------------------- */
/* 🪑 CREATE SEAT PAYMENT REQUEST                                             */
/* -------------------------------------------------------------------------- */
router.post("/seat/payment-request", requireAuth, async (req, res) => {
  try {
    const { durationMinutes } = req.body;

    if (!durationMinutes) {
      return res.status(400).json({ success: false, message: "durationMinutes required" });
    }

    const settings = await ensureSettings();
    const amount = settings.seatBasePrice || 50;

    const payment = await PaymentRequest.create({
      userId: req.user._id,
      type: "seat",
      seatDurationMinutes: durationMinutes,
      amount,
      status: "submitted"
    });

    res.status(201).json({ success: true, data: payment });
  } catch (err) {
    console.error("[Library] Seat payment error:", err);
    res.status(400).json({ success: false, message: "Failed to create seat payment" });
  }
});

/* -------------------------------------------------------------------------- */
/* 📖 CREATE BOOK PAYMENT REQUEST                                             */
/* -------------------------------------------------------------------------- */
router.post("/book/payment-request", requireAuth, async (req, res) => {
  try {
    const { bookId } = req.body;

    if (!bookId)
      return res.status(400).json({ success: false, message: "bookId required" });

    const book = await LibraryBook.findById(bookId);
    if (!book || !book.isPublished || !book.isPaid)
      return res.status(404).json({ success: false, message: "Paid book not found" });

    const amount = book.basePrice || 0;

    const payment = await PaymentRequest.create({
      userId: req.user._id,
      type: "book",
      bookId: book._id,
      amount,
      status: "submitted"
    });

    res.status(201).json({ success: true, data: payment });
  } catch (err) {
    console.error("[Library] Book payment error:", err);
    res.status(400).json({ success: false, message: "Failed to create book payment" });
  }
});

/* -------------------------------------------------------------------------- */
/* 🧾 PAYMENT SUBMISSION WITH SCREENSHOT                                      */
/* -------------------------------------------------------------------------- */
router.post(
  "/payment/:paymentId/submit",
  requireAuth,
  uploadPayment.single("screenshot"),
  async (req, res) => {
    try {
      const { name, phone } = req.body;

      const payment = await PaymentRequest.findOne({
        _id: req.params.paymentId,
        userId: req.user._id
      });

      if (!payment)
        return res.status(404).json({ success: false, message: "Payment request not found" });

      if (req.file) {
        payment.screenshotPath = "/uploads/payments/" + req.file.filename;
      }

      payment.name = name;
      payment.phone = phone;
      payment.status = "submitted";
      await payment.save();

      const settings = await ensureSettings();

      if (payment.type === "seat" && settings.autoApproveSeat)
        await autoApproveSeatPayment(payment, settings);

      if (payment.type === "book" && settings.autoApproveBook)
        await autoApproveBookPayment(payment, settings);

      res.json({ success: true, data: payment });
    } catch (err) {
      console.error("[Payment Submit] error:", err);
      res.status(400).json({ success: false, message: "Failed to submit payment" });
    }
  }
);

/* -------------------------------------------------------------------------- */
/* AUTO APPROVE SEAT                                                          */
/* -------------------------------------------------------------------------- */
async function autoApproveSeatPayment(payment, settings) {
  const now = new Date();
  const totalSeats = 50;

  const active = await SeatReservation.find({
    status: "active",
    endsAt: { $gt: now }
  }).select("seatNumber");

  const used = new Set(active.map((s) => s.seatNumber));

  let seatNumber = null;
  for (let i = 1; i <= totalSeats; i++) {
    if (!used.has(i)) {
      seatNumber = i;
      break;
    }
  }

  if (!seatNumber) return;

  const minutes = payment.seatDurationMinutes || 60;
  const endsAt = new Date(now.getTime() + minutes * 60000);

  await SeatReservation.create({
    userId: payment.userId,
    seatNumber,
    durationMinutes: minutes,
    startsAt: now,
    endsAt,
    status: "active",
    paymentId: payment._id
  });

  payment.status = "approved";
  await payment.save();
}

/* -------------------------------------------------------------------------- */
/* AUTO APPROVE BOOK                                                          */
/* -------------------------------------------------------------------------- */
async function autoApproveBookPayment(payment, settings) {
  const book = await LibraryBook.findById(payment.bookId);
  if (!book) return;

  const now = new Date();
  const hours = book.defaultReadingHours || settings.defaultReadingHours || 24;

  const expiresAt = new Date(now.getTime() + hours * 3600000);

  await BookPurchase.create({
    userId: payment.userId,
    bookId: book._id,
    readingHours: hours,
    readingStartsAt: now,
    readingExpiresAt: expiresAt,
    status: "active",
    paymentId: payment._id
  });

  payment.status = "approved";
  await payment.save();
}

/* -------------------------------------------------------------------------- */
/* GET MY ACTIVE PURCHASES                                                    */
/* -------------------------------------------------------------------------- */
router.get("/my/purchases", requireAuth, async (req, res) => {
  try {
    const now = new Date();

    const purchases = await BookPurchase.find({
      userId: req.user._id,
      readingExpiresAt: { $gt: now },
      status: "active"
    }).populate("bookId");

    res.json({ success: true, data: purchases });
  } catch (err) {
    console.error("[Library] GET /my/purchases error:", err);
    res.status(500).json({ success: false, message: "Failed to fetch purchases" });
  }
});

/* -------------------------------------------------------------------------- */
/* ACCESS CHECK                                                               */
/* -------------------------------------------------------------------------- */
router.get("/books/:bookId/access", requireAuth, async (req, res) => {
  try {
    const book = await LibraryBook.findById(req.params.bookId);

    if (!book || !book.isPublished)
      return res.status(404).json({ success: false, message: "Book not found" });

    const now = new Date();

    if (!book.isPaid) {
      return res.json({ success: true, data: { canRead: true, reason: "free" } });
    }

    const purchase = await BookPurchase.findOne({
      userId: req.user._id,
      bookId: book._id,
      status: "active",
      readingExpiresAt: { $gt: now }
    });

    if (!purchase) {
      return res.json({
        success: true,
        data: { canRead: false, reason: "no_active_purchase" }
      });
    }

    const seat = await SeatReservation.findOne({
      userId: req.user._id,
      status: "active",
      endsAt: { $gt: now }
    });

    if (!seat) {
      return res.json({
        success: true,
        data: {
          canRead: false,
          reason: "no_active_seat",
          purchaseExpiresAt: purchase.readingExpiresAt
        }
      });
    }

    res.json({
      success: true,
      data: {
        canRead: true,
        reason: "ok",
        seatEndsAt: seat.endsAt,
        purchaseExpiresAt: purchase.readingExpiresAt
      }
    });
  } catch (err) {
    console.error("[Library] GET access error:", err);
    res.status(500).json({ success: false, message: "Failed to check access" });
  }
});

export default router;
