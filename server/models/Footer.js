// server/models/Footer.js
const mongoose = require("mongoose");

const FooterSchema = new mongoose.Schema(
  {
    text: { type: String, default: "" },
    links: [
      {
        label: { type: String, default: "" },
        url: { type: String, default: "" },
      },
    ],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Footer", FooterSchema);
