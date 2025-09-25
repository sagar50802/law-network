// server/models/Consultancy.js
import mongoose from "mongoose";

const consultancySchema = new mongoose.Schema(
  {
    title:    { type: String, required: true },
    subtitle: { type: String, default: "" },
    intro:    { type: String, default: "" },
    image:    { type: String, required: true }, // e.g. /uploads/consultancy/123-file.jpg
    order:    { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.model("Consultancy", consultancySchema);
