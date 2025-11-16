// models/SeatReservation.js
import mongoose from "mongoose";

const SeatReservationSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    seatNumber: { type: Number, required: true },
    // in minutes or hours as you prefer, here minutes:
    durationMinutes: { type: Number, required: true },

    startsAt: { type: Date, required: true },
    endsAt: { type: Date, required: true },

    status: {
      type: String,
      enum: ["pending_payment", "pending_review", "active", "expired", "rejected"],
      default: "pending_payment",
    },

    // reference to payment record
    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: "PaymentRequest" },
  },
  { timestamps: true }
);

SeatReservationSchema.methods.isActive = function () {
  const now = new Date();
  return this.status === "active" && this.endsAt > now;
};

const SeatReservation = mongoose.model("SeatReservation", SeatReservationSchema);
export default SeatReservation;
