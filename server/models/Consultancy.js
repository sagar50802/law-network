import mongoose from "mongoose";

const ConsultancySchema = new mongoose.Schema(
  {
    title: String,
    subtitle: String,
    intro: String,
    order: { type: Number, default: 0 },
    image: String,             // main card image (R2 or GridFS URL)

    // NEW: per-card deep links (all optional)
    whatsapp: { type: String, default: "" },   // e.g. https://wa.me/91999...?text=...
    telegram: { type: String, default: "" },   // e.g. https://t.me/username
    instagram:{ type: String, default: "" },   // e.g. https://instagram.com/handle
    email:    { type: String, default: "" },   // mailto:hi@example.com
    website:  { type: String, default: "" },   // e.g. https://example.com

    // NEW: optional QR image for internal use (NOT rendered publicly)
    whatsappQr: { type: String, default: "" }, // stored URL (R2 or GridFS)
  },
  { timestamps: true }
);

export default mongoose.models.Consultancy ||
  mongoose.model("Consultancy", ConsultancySchema);
