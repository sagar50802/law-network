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

    // media
    coverUrl: String,     // public cover URL (R2 or uploads)
    previewImage: String, // optional preview
    pdfUrl: String,       // full book PDF (R2/public URL)

    // hours of reading window for paid access
    defaultReadingHours: { type: Number, default: 24 },

    isPublished: { type: Boolean, default: true },
  },
  { timestamps: true }
);

const LibraryBook = mongoose.model("LibraryBook", LibraryBookSchema);
export default LibraryBook;
