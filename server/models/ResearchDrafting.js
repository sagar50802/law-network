// server/models/ResearchDrafting.js
import mongoose from "mongoose";

const GenBlockSchema = new mongoose.Schema(
  {
    text: { type: String, default: "" },
    sources: [{ type: String }],
  },
  { _id: false }
);

const ResearchDraftingSchema = new mongoose.Schema(
  {
    // who (viewer) submitted
    email: { type: String, index: true },
    phone: { type: String },
    name: { type: String },

    // initial intake form
    gender: String,
    place: String,
    nationality: String,
    country: String,
    instituteType: {
      type: String,
      enum: ["school", "college", "university", "other"],
      default: "college",
    },
    instituteName: String,
    qualifications: [{ type: String }],
    subject: String,
    title: String,
    nature: {
      type: String,
      enum: ["doctrinal", "empirical", "auto"],
      default: "auto",
    },
    abstract: String,
    totalPages: Number,

    // generation blocks
    gen: {
      title: { type: String, default: "" },
      abstract: GenBlockSchema,
      review: GenBlockSchema,
      methodology: GenBlockSchema,
      aims: GenBlockSchema,
      chapterization: GenBlockSchema,
      conclusion: GenBlockSchema,
      assembled: GenBlockSchema,
    },

    // flow
    status: {
      type: String,
      enum: ["draft", "awaiting_payment", "paid", "approved", "rejected"],
      default: "draft",
    },

    // ✅ payment overlay (expanded to match route code)
    payment: {
      plan: { type: String, default: "research-drafting" },
      amount: { type: Number, default: 299 },
      upiId: { type: String, default: "" },
      waNumber: { type: String, default: "" },
      userMarkedPaid: { type: Boolean, default: false },
      proofScreenshotUrl: { type: String, default: "" },
      markedAt: Date,

      // ✅ new fields required by backend
      upiConfirmed: { type: Boolean, default: false },
      upiConfirmedAt: Date,
      whatsappConfirmed: { type: Boolean, default: false },
      whatsappConfirmedAt: Date,
    },

    // ✅ admin review
    admin: {
      approved: { type: Boolean, default: false },
      approvedUntil: Date,
      revoked: { type: Boolean, default: false },
      notes: String,
      autoUnlockedFromPayment: { type: Boolean, default: false },
    },
  },
  { timestamps: true }
);

export default mongoose.model("ResearchDrafting", ResearchDraftingSchema);
