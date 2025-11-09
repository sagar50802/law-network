/* -------------------------------------------------------------------------- */
/* ✅ Classroom API Routes — Law Network                                      */
/* -------------------------------------------------------------------------- */

import express from "express";
import mongoose from "mongoose";
import Lecture from "../models/Lecture.js";

const router = express.Router();

/* -------------------------------------------------------------------------- */
/* ✅ Ensure MongoDB Connection (safety fallback)                             */
/* -------------------------------------------------------------------------- */
if (mongoose.connection.readyState === 0) {
  const MONGO_FALLBACK = "mongodb://127.0.0.1:27017/classroomdb";
  mongoose
    .connect(process.env.MONGO_URI || MONGO_FALLBACK)
    .then(() => console.log("✅ [Classroom] MongoDB connected"))
    .catch((err) => console.error("Mongo connection error:", err.message));
}

/* -------------------------------------------------------------------------- */
/* ✅ Routes                                                                  */
/* -------------------------------------------------------------------------- */

// GET /api/classroom/lectures?status=released
router.get("/lectures", async (req, res) => {
  try {
    const { status } = req.query;
    const filter = status ? { status } : {};
    const lectures = await Lecture.find(filter).sort({ releaseAt: 1 });
    res.json({ success: true, data: lectures });
  } catch (err) {
    console.error("[Classroom] GET /lectures error:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch lectures" });
  }
});

// GET /api/classroom/lectures/:id
router.get("/lectures/:id", async (req, res) => {
  try {
    const lecture = await Lecture.findById(req.params.id);
    if (!lecture) {
      return res
        .status(404)
        .json({ success: false, message: "Lecture not found" });
    }
    res.json({ success: true, data: lecture });
  } catch (err) {
    console.error("[Classroom] GET /lectures/:id error:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch lecture" });
  }
});

// POST /api/classroom/lectures
router.post("/lectures", async (req, res) => {
  try {
    const { title, subject, avatarType, releaseAt, status } = req.body;

    if (!title || !subject) {
      return res
        .status(400)
        .json({ success: false, message: "Title and subject are required" });
    }

    const lecture = await Lecture.create({
      title,
      subject,
      avatarType,
      releaseAt: releaseAt || new Date(),
      status: status || "draft",
      slides: [],
    });

    res.status(201).json({ success: true, data: lecture });
  } catch (err) {
    console.error("[Classroom] POST /lectures error:", err);
    res
      .status(400)
      .json({ success: false, message: "Failed to create lecture" });
  }
});

// PUT /api/classroom/lectures/:id
router.put("/lectures/:id", async (req, res) => {
  try {
    const { title, subject, avatarType, releaseAt, status } = req.body;

    const lecture = await Lecture.findByIdAndUpdate(
      req.params.id,
      { title, subject, avatarType, releaseAt, status },
      { new: true, runValidators: true }
    );

    if (!lecture) {
      return res
        .status(404)
        .json({ success: false, message: "Lecture not found" });
    }

    res.json({ success: true, data: lecture });
  } catch (err) {
    console.error("[Classroom] PUT /lectures/:id error:", err);
    res
      .status(400)
      .json({ success: false, message: "Failed to update lecture" });
  }
});

// DELETE /api/classroom/lectures/:id
router.delete("/lectures/:id", async (req, res) => {
  try {
    const result = await Lecture.findByIdAndDelete(req.params.id);
    if (!result) {
      return res
        .status(404)
        .json({ success: false, message: "Lecture not found" });
    }
    res.json({ success: true, message: "Lecture deleted" });
  } catch (err) {
    console.error("[Classroom] DELETE /lectures/:id error:", err);
    res
      .status(400)
      .json({ success: false, message: "Failed to delete lecture" });
  }
});

// DELETE /api/classroom/lectures  (batch delete)
router.delete("/lectures", async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) {
      return res
        .status(400)
        .json({ success: false, message: "ids must be an array" });
    }
    const result = await Lecture.deleteMany({ _id: { $in: ids } });
    res.json({ success: true, deleted: result.deletedCount });
  } catch (err) {
    console.error("[Classroom] DELETE batch error:", err);
    res
      .status(400)
      .json({ success: false, message: "Failed to batch delete" });
  }
});

// ✅ GET /api/classroom/lectures/:lectureId/slides
router.get("/lectures/:lectureId/slides", async (req, res) => {
  try {
    const lecture = await Lecture.findById(req.params.lectureId);
    if (!lecture)
      return res
        .status(404)
        .json({ success: false, message: "Lecture not found" });
    res.json({ success: true, slides: lecture.slides || [] });
  } catch (err) {
    console.error("[Classroom] GET slides error:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch slides" });
  }
});

// ✅ PUT /api/classroom/lectures/:lectureId/slides
router.put("/lectures/:lectureId/slides", async (req, res) => {
  try {
    const { slides } = req.body;
    if (!Array.isArray(slides)) {
      return res
        .status(400)
        .json({ success: false, message: "slides must be an array" });
    }

    const lecture = await Lecture.findById(req.params.lectureId);
    if (!lecture)
      return res
        .status(404)
        .json({ success: false, message: "Lecture not found" });

    lecture.slides = slides.map((s, i) => ({
      topicTitle: s.topicTitle || `Slide ${i + 1}`,
      content: s.content || "",
      media: s.media || {},
      order: i,
      updatedAt: new Date(),
    }));

    await lecture.save();
    res.json({ success: true, slides: lecture.slides });
  } catch (err) {
    console.error("[Classroom] PUT slides error:", err);
    res
      .status(400)
      .json({ success: false, message: "Failed to save slides" });
  }
});

/* -------------------------------------------------------------------------- */
/* ✅ Export Router                                                           */
/* -------------------------------------------------------------------------- */
export default router;
