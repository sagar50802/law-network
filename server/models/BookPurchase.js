// models/BookPurchase.js
import mongoose from "mongoose";

const BookPurchaseSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    bookId: { type: mongoose.Schema.Types.ObjectId, ref: "LibraryBook", required: true },

    // total allowed hours for reading
    readingHours: { type: Number, required: true },

    readingStartsAt: { type: Date, required: true },
    readingExpiresAt: { type: Date, required: true },

    status: {
      type: String,
      enum: ["pending_payment", "pending_review", "active", "expired", "rejected"],
      default: "pending_payment",
    },

    paymentId: { type: mongoose.Schema.Types.ObjectId, ref: "PaymentRequest" },
  },
  { timestamps: true }
);

BookPurchaseSchema.methods.isActive = function () {
  const now = new Date();
  return this.status === "active" && this.readingExpiresAt > now;
};

const BookPurchase = mongoose.model("BookPurchase", BookPurchaseSchema);
export default BookPurchase;
