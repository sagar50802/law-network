// models/LibraryBook.js
import mongoose from "mongoose";

const LibraryBookSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    subtitle: String,
    description: String,
    author: String,
    subject: String,

    isPaid: { type: Boolean, default: false },
    basePrice: { type: Number, default: 0 }, // for reference only

    // media
    coverImage: String,     // URL/path to cover image
    previewImage: String,   // one-page preview image
    pdfFile: String,        // secure path to full PDF (no direct public link)

    // reading duration for paid access in hours (e.g. 24, 72, etc.)
    defaultReadingHours: { type: Number, default: 24 },

    isPublished: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const LibraryBook = mongoose.model("LibraryBook", LibraryBookSchema);
export default LibraryBook;
