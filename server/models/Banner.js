const mongoose = require("mongoose");

const bannerSchema = new mongoose.Schema(
  {
    title: { type: String, default: "" },
    type: { type: String, enum: ["image", "video"], required: true },
    url: { type: String, required: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Banner", bannerSchema);
