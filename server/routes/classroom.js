/* -------------------------------------------------------------------------- */
/* ✅ Classroom API Routes — Law Network                                      */
/* -------------------------------------------------------------------------- */

import express from "express";
import mongoose from "mongoose";
import Lecture from "../models/Lecture.js";

const router = express.Router();

/* -------------------------------------------------------------------------- */
/* ✅ Ensure Mongo is connected (safety check)                                */
/* -------------------------------------------------------------------------- */
if (mongoose.connection.readyState === 0) {
  const MONGO_FALLBACK = "mongodb://127.0.0.1:27017/classroomdb";
  mongoose
    .connect(process.env.MONGO_URI || MONGO_FALLBACK)
    .then(() => console.log("✅ [Classroom] MongoDB connected"))
    .catch((err) => console.error("Mongo error", err));
}

/* -------------------------------------------------------------------------- */
/* ✅ Routes                                                                  */
/* -------------------------------------------------------------------------- */

// GET /api/classroom/lectures?status=released
router.get("/lectures", async (req, res) => {
  try {
    const { status } = req.query;
    const query = {};
    if (status) query.status = status;
    const lectures = await Lecture.find(query).sort({ releaseAt: 1 });
    res.json(lectures);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch lectures" });
  }
});

// GET /api/classroom/lectures/:id
router.get("/lectures/:id", async (req, res) => {
  try {
    const lecture = await Lecture.findById(req.params.id);
    if (!lecture) return res.status(404).json({ message: "Lecture not found" });
    res.json(lecture);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch lecture" });
  }
});

// POST /api/classroom/lectures
router.post("/lectures", async (req, res) => {
  try {
    const { title, subject, avatarType, releaseAt, status } = req.body;
    const lecture = await Lecture.create({
      title,
      subject,
      avatarType,
      releaseAt,
      status: status || "draft",
      slides: [],
    });
    res.status(201).json(lecture);
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: "Failed to create lecture" });
  }
});

// PUT /api/classroom/lectures/:id  (update meta)
router.put("/lectures/:id", async (req, res) => {
  try {
    const { title, subject, avatarType, releaseAt, status } = req.body;
    const lecture = await Lecture.findByIdAndUpdate(
      req.params.id,
      { title, subject, avatarType, releaseAt, status },
      { new: true }
    );
    if (!lecture) return res.status(404).json({ message: "Lecture not found" });
    res.json(lecture);
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: "Failed to update lecture" });
  }
});

// DELETE /api/classroom/lectures/:id
router.delete("/lectures/:id", async (req, res) => {
  try {
    await Lecture.findByIdAndDelete(req.params.id);
    res.json({ message: "Lecture deleted" });
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: "Failed to delete lecture" });
  }
});

// DELETE /api/classroom/lectures  (batch delete: {ids: []})
router.delete("/lectures", async (req, res) => {
  try {
    const { ids } = req.body;
    if (!Array.isArray(ids)) {
      return res.status(400).json({ message: "ids must be an array" });
    }
    await Lecture.deleteMany({ _id: { $in: ids } });
    res.json({ message: "Lectures deleted" });
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: "Failed to batch delete" });
  }
});

// GET /api/classroom/lectures/:id/slides
router.get("/lectures/:id/slides", async (req, res) => {
  try {
    const lecture = await Lecture.findById(req.params.id);
    if (!lecture) return res.status(404).json({ message: "Lecture not found" });
    res.json(lecture.slides || []);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Failed to fetch slides" });
  }
});

// PUT /api/classroom/lectures/:id/slides  (replace slides array)
router.put("/lectures/:id/slides", async (req, res) => {
  try {
    const { slides } = req.body; // array of {topicTitle, content, media}
    const lecture = await Lecture.findById(req.params.id);
    if (!lecture) return res.status(404).json({ message: "Lecture not found" });

    lecture.slides = (slides || []).map((s, idx) => ({
      topicTitle: s.topicTitle,
      content: s.content,
      media: s.media || {},
      order: idx,
    }));

    await lecture.save();
    res.json(lecture.slides);
  } catch (err) {
    console.error(err);
    res.status(400).json({ message: "Failed to save slides" });
  }
});

/* -------------------------------------------------------------------------- */
/* ✅ Export Router                                                           */
/* -------------------------------------------------------------------------- */
export default router;
