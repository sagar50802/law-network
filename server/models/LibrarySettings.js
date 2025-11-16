import mongoose from "mongoose";

const LibrarySettingsSchema = new mongoose.Schema(
  {
    seatBasePrice: { type: Number, default: 50 }, // ₹50
    seatDurationsMinutes: { type: [Number], default: [60, 300, 1440] },

    defaultReadingHours: { type: Number, default: 24 },

    autoApproveSeat: { type: Boolean, default: false },
    autoApproveBook: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Ensure only ONE settings document exists
export default mongoose.model("LibrarySettings", LibrarySettingsSchema);
