import mongoose from "mongoose";

/* -------------------------------------------------------------------------- */
/* 🎬 Media Schema — For video / audio / image URLs                           */
/* -------------------------------------------------------------------------- */
const mediaSchema = new mongoose.Schema(
  {
    videoUrl: { type: String, trim: true },
    audioUrl: { type: String, trim: true },
    imageUrl: { type: String, trim: true },
  },
  { _id: false }
);

/* -------------------------------------------------------------------------- */
/* 🧾 Slide Schema — Each Lecture’s Slide                                     */
/* -------------------------------------------------------------------------- */
const slideSchema = new mongoose.Schema(
  {
    topicTitle: { type: String, required: true, trim: true },
    content: { type: String, required: true },
    media: mediaSchema,
    order: { type: Number, default: 0, index: true },
  },
  { timestamps: true }
);

/* -------------------------------------------------------------------------- */
/* 🎓 Lecture Schema — Top-Level Classroom Entity                             */
/* -------------------------------------------------------------------------- */
const lectureSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    subject: { type: String, required: true, trim: true },
    avatarType: { type: String, default: "teacher1", trim: true },
    releaseAt: { type: Date, required: true },

    status: {
      type: String,
      enum: ["draft", "scheduled", "released", "completed"],
      default: "draft",
      index: true,
    },

    slides: { type: [slideSchema], default: [] },

    // ✅ Access Type: visibility of lecture (public or protected)
    accessType: {
      type: String,
      enum: ["public", "protected"], // public = open to all; protected = admin / link only
      default: "public",
      index: true,
    },
  },
  { timestamps: true }
);

/* -------------------------------------------------------------------------- */
/* ⚙️ Model Options                                                          */
/* -------------------------------------------------------------------------- */
lectureSchema.index({ releaseAt: 1 }); // faster queries for upcoming/released lectures

/* -------------------------------------------------------------------------- */
/* ✅ Export Model                                                           */
/* -------------------------------------------------------------------------- */
const Lecture = mongoose.model("Lecture", lectureSchema);
export default Lecture;
