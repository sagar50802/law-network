// server/models/NewsItem.js

const mongoose = require("mongoose");

const newsItemSchema = new mongoose.Schema(
  {
    imageUrl: { type: String }, // served from /uploads/news/...
    title: { type: String, required: true },
    url: { type: String, required: true }, // ✅ renamed from "link" → "url"
    isActive: { type: Boolean, default: true }, // ✅ add for consistency with routes/news.js
    createdAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true } // auto-manages createdAt/updatedAt
);

module.exports = mongoose.model("NewsItem", newsItemSchema);
