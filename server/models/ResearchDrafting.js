// server/models/ResearchDrafting.js
import mongoose from "mongoose";

const GenBlockSchema = new mongoose.Schema({
  text: { type: String, default: "" },
  sources: [{ type: String }], // optional: store detected refs (strings)
}, { _id: false });

const ResearchDraftingSchema = new mongoose.Schema({
  // who (viewer) submitted
  email: { type: String, index: true },
  phone: { type: String },
  name: { type: String },

  // initial intake form
  gender: String,
  place: String,
  nationality: String,
  country: String,
  instituteType: { type: String, enum: ["school", "college", "university", "other"], default: "college" },
  instituteName: String,
  qualifications: [{ type: String }], // ["10","12","ug","pg","diploma","phd"]
  subject: String,
  title: String,
  nature: { type: String, enum: ["doctrinal","empirical","auto"], default: "auto" },
  abstract: String,
  totalPages: Number, // 1..n

  // generation blocks
  gen: {
    title: { type: String, default: "" },
    abstract: GenBlockSchema,
    review: GenBlockSchema,
    methodology: GenBlockSchema,
    aims: GenBlockSchema,
    chapterization: GenBlockSchema,
    conclusion: GenBlockSchema,
    assembled: GenBlockSchema, // full preview
  },

  // flow
  status: { type: String, enum: ["draft","awaiting_payment","paid","approved","rejected"], default: "draft" },

  // payment overlay
  payment: {
    plan: { type: String, default: "research-drafting" },
    amount: { type: Number, default: 299 }, // INR; admin-configurable
    upiId: { type: String, default: "" },    // admin-configurable at runtime
    waNumber: { type: String, default: "" }, // admin-configurable
    userMarkedPaid: { type: Boolean, default: false },
    proofScreenshotUrl: { type: String, default: "" },
    markedAt: Date
  },

  // admin review
  admin: {
    approved: { type: Boolean, default: false },
    approvedUntil: Date,
    revoked: { type: Boolean, default: false },
    notes: String,
  },

  // timestamps
}, { timestamps: true });

export default mongoose.model("ResearchDrafting", ResearchDraftingSchema);
