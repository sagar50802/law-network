// routes/libraryUser.js
import express from "express";
import LibraryBook from "../models/LibraryBook.js";
import BookPurchase from "../models/BookPurchase.js";
import SeatReservation from "../models/SeatReservation.js";
import PaymentRequest from "../models/PaymentRequest.js";
import LibrarySettings from "../models/LibrarySettings.js";

const router = express.Router();

// TODO: replace with your real auth middleware
const requireAuth = (req, res, next) => {
  if (!req.user) {
    return res
      .status(401)
      .json({ success: false, message: "Unauthorized" });
  }
  next();
};

/* -------------------------------------------------------------------------- */
/* Helper: ensure settings document exists                                    */
/* -------------------------------------------------------------------------- */
async function ensureSettings() {
  let settings = await LibrarySettings.findOne();
  if (!settings) settings = await LibrarySettings.create({});
  return settings;
}

/* -------------------------------------------------------------------------- */
/* 📚 GET /api/library/books  - public list                                   */
/* -------------------------------------------------------------------------- */
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

/* -------------------------------------------------------------------------- */
/* 📚 GET /api/library/books/:id - single book detail                         */
/* -------------------------------------------------------------------------- */
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

/* -------------------------------------------------------------------------- */
/* 🪑 GET /api/library/seat/status - user seat status                         */
/* -------------------------------------------------------------------------- */
router.get("/seat/status", requireAuth, async (req, res) => {
  try {
    const now = new Date();
    const seat = await SeatReservation.findOne({
      userId: req.user._id,
      status: "active",
      endsAt: { $gt: now },
    });

    if (!seat) {
      return res.json({
        success: true,
        data: { hasActiveSeat: false, seatEndsAt: null },
      });
    }

    res.json({
      success: true,
      data: {
        hasActiveSeat: true,
        seatEndsAt: seat.endsAt,
        seatNumber: seat.seatNumber,
      },
    });
  } catch (err) {
    console.error("[Library] GET /seat/status error:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch seat status" });
  }
});

/* -------------------------------------------------------------------------- */
/* 🧾 POST /api/library/seat/payment-request                                  */
/* User chooses duration, we calculate amount using settings                  */
/* -------------------------------------------------------------------------- */
router.post("/seat/payment-request", requireAuth, async (req, res) => {
  try {
    const { durationMinutes } = req.body;
    if (!durationMinutes) {
      return res
        .status(400)
        .json({ success: false, message: "durationMinutes required" });
    }

    const settings = await ensureSettings();

    // simple pricing: base price per reservation
    // you can change to basePrice * multiplier based on duration
    const amount = settings.seatBasePrice || 50;

    const payment = await PaymentRequest.create({
      userId: req.user._id,
      type: "seat",
      seatDurationMinutes: durationMinutes,
      amount,
      status: "submitted", // screenshot to be attached next
    });

    res.status(201).json({ success: true, data: payment });
  } catch (err) {
    console.error("[Library] POST /seat/payment-request error:", err);
    res
      .status(400)
      .json({ success: false, message: "Failed to create seat payment" });
  }
});

/* -------------------------------------------------------------------------- */
/* 📖 POST /api/library/book/payment-request                                  */
/* User starts a paid-book purchase                                            */
/* -------------------------------------------------------------------------- */
router.post("/book/payment-request", requireAuth, async (req, res) => {
  try {
    const { bookId } = req.body;
    if (!bookId) {
      return res
        .status(400)
        .json({ success: false, message: "bookId required" });
    }

    const book = await LibraryBook.findById(bookId);
    if (!book || !book.isPublished || !book.isPaid) {
      return res
        .status(404)
        .json({ success: false, message: "Paid book not found" });
    }

    const amount = book.basePrice || 0;

    const payment = await PaymentRequest.create({
      userId: req.user._id,
      type: "book",
      bookId: book._id,
      amount,
      status: "submitted",
    });

    res.status(201).json({ success: true, data: payment });
  } catch (err) {
    console.error("[Library] POST /book/payment-request error:", err);
    res
      .status(400)
      .json({ success: false, message: "Failed to create book payment" });
  }
});

/* -------------------------------------------------------------------------- */
/* 🖼️ POST /api/library/payment/:paymentId/submit                             */
/* Attach screenshot + name + phone                                           */
/* Optionally auto-approve seat/book based on settings                        */
/* -------------------------------------------------------------------------- */
router.post("/payment/:paymentId/submit", requireAuth, async (req, res) => {
  try {
    const { name, phone, screenshotPath } = req.body;
    // NOTE: integrate multer later for real file upload -> screenshotPath = req.file.path

    const payment = await PaymentRequest.findOne({
      _id: req.params.paymentId,
      userId: req.user._id,
    });

    if (!payment) {
      return res
        .status(404)
        .json({ success: false, message: "Payment request not found" });
    }

    payment.name = name;
    payment.phone = phone;
    if (screenshotPath) payment.screenshotPath = screenshotPath;
    payment.status = "submitted";
    await payment.save();

    const settings = await ensureSettings();

    // Auto-approve logic
    if (payment.type === "seat" && settings.autoApproveSeat) {
      await autoApproveSeatPayment(payment, settings);
    } else if (payment.type === "book" && settings.autoApproveBook) {
      await autoApproveBookPayment(payment, settings);
    }

    res.json({ success: true, data: payment });
  } catch (err) {
    console.error("[Library] POST /payment/:paymentId/submit error:", err);
    res
      .status(400)
      .json({ success: false, message: "Failed to submit payment" });
  }
});

/* -------------------------------------------------------------------------- */
/* Helper: auto-approve seat payment                                          */
/* -------------------------------------------------------------------------- */
async function autoApproveSeatPayment(payment, settings) {
  const now = new Date();

  // find active seats to choose seat number
  const totalSeats = 50; // you can move this to settings later
  const activeSeats = await SeatReservation.find({
    status: "active",
    endsAt: { $gt: now },
  }).select("seatNumber");
  const usedSeatNumbers = new Set(activeSeats.map((s) => s.seatNumber));

  let seatNumber = null;
  for (let i = 1; i <= totalSeats; i++) {
    if (!usedSeatNumbers.has(i)) {
      seatNumber = i;
      break;
    }
  }

  if (!seatNumber) {
    // no seat available -> do not approve
    return;
  }

  const durationMinutes = payment.seatDurationMinutes || 60;
  const endsAt = new Date(now.getTime() + durationMinutes * 60 * 1000);

  await SeatReservation.create({
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
}

/* -------------------------------------------------------------------------- */
/* Helper: auto-approve book payment                                          */
/* -------------------------------------------------------------------------- */
async function autoApproveBookPayment(payment, settings) {
  const book = await LibraryBook.findById(payment.bookId);
  if (!book) return;

  const now = new Date();
  const readingHours =
    book.defaultReadingHours || settings.defaultReadingHours || 24;
  const expiresAt = new Date(now.getTime() + readingHours * 60 * 60 * 1000);

  await BookPurchase.create({
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
}

/* -------------------------------------------------------------------------- */
/* 🧾 GET /api/library/my/purchases  - for "My Shelf" tab                     */
/* -------------------------------------------------------------------------- */
router.get("/my/purchases", requireAuth, async (req, res) => {
  try {
    const now = new Date();
    const purchases = await BookPurchase.find({
      userId: req.user._id,
      readingExpiresAt: { $gt: now },
      status: "active",
    }).populate("bookId");

    res.json({ success: true, data: purchases });
  } catch (err) {
    console.error("[Library] GET /my/purchases error:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch purchases" });
  }
});

/* -------------------------------------------------------------------------- */
/* 🔐 GET /api/library/books/:bookId/access                                   */
/* Check if user can read a book (free vs paid, seat requirement)             */
/* -------------------------------------------------------------------------- */
router.get("/books/:bookId/access", requireAuth, async (req, res) => {
  try {
    const book = await LibraryBook.findById(req.params.bookId);
    if (!book || !book.isPublished) {
      return res
        .status(404)
        .json({ success: false, message: "Book not found" });
    }

    const now = new Date();

    // Free books: no need seat, no purchase
    if (!book.isPaid) {
      return res.json({
        success: true,
        data: {
          canRead: true,
          reason: "free",
          seatRequired: false,
        },
      });
    }

    // Paid book: requires active purchase
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

    // Also requires active seat
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

    // ✅ Both active
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

export default router;
