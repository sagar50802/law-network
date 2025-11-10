import mongoose from "mongoose";

const accessLinkSchema = new mongoose.Schema(
  {
    token: {
      type: String,
      unique: true,
      required: true, // 🔒 make sure every link has one
    },

    lectureId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Lecture",
      required: true,
    },

    isFree: {
      type: Boolean,
      default: false,
    },

    // ⏳ Optional expiry (null means permanent)
    expiresAt: {
      type: Date,
      default: null,
    },

    // 🧑‍💻 For paid links — who’s allowed
    allowedUsers: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "User",
      },
    ],

    // 👀 Tracking visits
    visits: {
      type: Number,
      default: 0,
    },

    // 🧾 Track unique visitors (userId or IP)
    visitors: [
      {
        type: String,
      },
    ],
  },
  {
    timestamps: true, // 🕒 adds createdAt and updatedAt automatically
  }
);

export default mongoose.model("AccessLink", accessLinkSchema);
