// models/PaymentRequest.js
import mongoose from "mongoose";

const PaymentRequestSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    type: {
      type: String,
      enum: ["seat", "book"],
      required: true,
    },

    // for "book" type
    bookId: { type: mongoose.Schema.Types.ObjectId, ref: "LibraryBook" },

    // for "seat" type
    seatDurationMinutes: Number,

    amount: { type: Number, required: true },

    screenshotPath: String, // file path to uploaded screenshot
    name: String,
    phone: String,

    status: {
      type: String,
      enum: ["submitted", "approved", "rejected"],
      default: "submitted",
    },

    // auto/manual approval flags can be handled in settings, not here
  },
  { timestamps: true }
);

const PaymentRequest = mongoose.model("PaymentRequest", PaymentRequestSchema);
export default PaymentRequest;
