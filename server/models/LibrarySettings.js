// models/LibrarySettings.js
import mongoose from "mongoose";

const LibrarySettingsSchema = new mongoose.Schema(
  {
    // single settings doc
    seatBasePrice: { type: Number, default: 50 },
    seatDurationsMinutes: { type: [Number], default: [60, 300, 1440] }, // 1h, 5h, 24h

    autoApproveSeat: { type: Boolean, default: false },
    autoApproveBook: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const LibrarySettings = mongoose.model("LibrarySettings", LibrarySettingsSchema);
export default LibrarySettings;
