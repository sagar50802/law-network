import mongoose from "mongoose";

const LibraryBookSchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    subtitle: String,
    description: String,
    author: String,
    subject: String,

    isPaid: { type: Boolean, default: false },
    basePrice: { type: Number, default: 0 },

    /* --------------------------------------------------------
       MUST MATCH what admin upload & client reader expects
       -------------------------------------------------------- */
    coverUrl: String,     // 👈 matches BooksPage.jsx & BookCard.jsx
    previewImage: String, // optional preview
    pdfUrl: String,       // 👈 CRITICAL! PDF URL MUST BE STORED HERE

    defaultReadingHours: { type: Number, default: 24 },

    isPublished: { type: Boolean, default: true }
  },
  { timestamps: true }
);

const LibraryBook = mongoose.model("LibraryBook", LibraryBookSchema);
export default LibraryBook;
