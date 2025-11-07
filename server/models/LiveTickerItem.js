import mongoose from "mongoose";

/**
 * LiveTickerItem
 * --------------------------------------------------
 * Stores scrolling news tickers / bulletins displayed
 * at the bottom of the live broadcast screen.
 */
const liveTickerItemSchema = new mongoose.Schema(
  {
    text: {
      type: String,
      required: true,
      trim: true,
    },
    kind: {
      type: String,
      enum: ["BREAKING", "INFO", "EXAM", "PROMO"],
      default: "INFO",
    },
    isActive: {
      type: Boolean,
      default: true, // ✅ ensures visible in live feed
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: true }, // ✅ adds updatedAt
  }
);

// Index newest first for better retrieval performance
liveTickerItemSchema.index({ createdAt: -1 });

export default mongoose.model("LiveTickerItem", liveTickerItemSchema);
