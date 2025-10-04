import mongoose from "mongoose";

const ConsultancySchema = new mongoose.Schema(
  {
    title: { type: String, required: true },
    subtitle: { type: String, default: "" },
    intro: { type: String, default: "" },
    order: { type: Number, default: 0 },
    image: { type: String, default: "" },

    // NEW optional deep-link fields
    whatsapp:  { type: String, default: "" },
    telegram:  { type: String, default: "" },
    instagram: { type: String, default: "" },
    email:     { type: String, default: "" },   // allow "mailto:..." or plain email
    website:   { type: String, default: "" },
  },
  { timestamps: true }
);

export default mongoose.models.Consultancy ||
  mongoose.model("Consultancy", ConsultancySchema);
