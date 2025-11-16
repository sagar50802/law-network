// routes/libraryAdmin.js
import express from "express";
import PaymentRequest from "../models/PaymentRequest.js";
import SeatReservation from "../models/SeatReservation.js";
import BookPurchase from "../models/BookPurchase.js";
import LibraryBook from "../models/LibraryBook.js";
import LibrarySettings from "../models/LibrarySettings.js";

const router = express.Router();

// TODO: replace with your real admin auth
const requireAdmin = (req, res, next) => {
  if (!req.user || !req.user.isAdmin) {
    return res
      .status(403)
      .json({ success: false, message: "Admin only" });
  }
  next();
};

/* -------------------------------------------------------------------------- */
/* Helper: ensure settings                                                    */
/* -------------------------------------------------------------------------- */
async function ensureSettings() {
  let settings = await LibrarySettings.findOne();
  if (!settings) settings = await LibrarySettings.create({});
  return settings;
}

/* -------------------------------------------------------------------------- */
/* 💰 GET /api/admin/library/payments                                         */
/* List pending payment requests (seat + book)                                */
/* -------------------------------------------------------------------------- */
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

/* -------------------------------------------------------------------------- */
/* 💰 POST /api/admin/library/payments/reject/:paymentId                      */
/* -------------------------------------------------------------------------- */
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
      console.error("[Admin] POST /payments/reject error:", err);
      res
        .status(500)
        .json({ success: false, message: "Failed to reject payment" });
    }
  }
);

/* -------------------------------------------------------------------------- */
/* 💺 POST /api/admin/library/seat/approve/:paymentId                         */
/* Manual seat approval (admin button)                                       */
/* -------------------------------------------------------------------------- */
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
      const totalSeats = 50; // or load from settings in future
      const active = await SeatReservation.find({
        status: "active",
        endsAt: { $gt: now },
      }).select("seatNumber");

      const usedSeatNumbers = new Set(active.map((s) => s.seatNumber));
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
          message: "No seats available to approve",
        });
      }

      const durationMinutes = payment.seatDurationMinutes || 60;
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

      payment.status = "approved";
      await payment.save();

      res.json({ success: true, data: reservation });
    } catch (err) {
      console.error("[Admin] POST /seat/approve error:", err);
      res
        .status(500)
        .json({ success: false, message: "Failed to approve seat" });
    }
  }
);

/* -------------------------------------------------------------------------- */
/* 📖 POST /api/admin/library/book/approve/:paymentId                         */
/* Manual paid-book approval                                                 */
/* -------------------------------------------------------------------------- */
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
      console.error("[Admin] POST /book/approve error:", err);
      res
        .status(500)
        .json({ success: false, message: "Failed to approve book" });
    }
  }
);

/* -------------------------------------------------------------------------- */
/* 💺 GET /api/admin/library/seats                                            */
/* Active seat reservations                                                  */
/* -------------------------------------------------------------------------- */
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

/* -------------------------------------------------------------------------- */
/* 📖 GET /api/admin/library/book-purchases                                   */
/* All active book purchases                                                 */
/* -------------------------------------------------------------------------- */
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

/* -------------------------------------------------------------------------- */
/* 📖 POST /api/admin/library/book-purchases/revoke/:purchaseId               */
/* Manually revoke reading access                                            */
/* -------------------------------------------------------------------------- */
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
      console.error("[Admin] POST /book-purchases/revoke error:", err);
      res.status(500).json({
        success: false,
        message: "Failed to revoke access",
      });
    }
  }
);

export default router;
