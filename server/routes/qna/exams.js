const express = require("express");
const router = express.Router();
const ownerCheck = require("../../middleware/ownerCheck");

const Exam = require("../../models/qna/Exam");
const Unit = require("../../models/qna/Unit");
const Topic = require("../../models/qna/Topic");
const Subtopic = require("../../models/qna/Subtopic");
const Question = require("../../models/qna/Question");

/* ---------------------------
   PUBLIC: Get all exams
---------------------------- */
router.get("/", async (req, res) => {
  const exams = await Exam.find().sort({ createdAt: -1 });
  res.json(exams);
});

/* ---------------------------
   PUBLIC: Single exam detail
---------------------------- */
router.get("/:examId", async (req, res) => {
  const exam = await Exam.findById(req.params.examId);
  res.json(exam);
});

/* ---------------------------
   ADMIN: Create exam
---------------------------- */
router.post("/", ownerCheck, async (req, res) => {
  const exam = await Exam.create(req.body);
  res.json(exam);
});

/* ---------------------------
   ADMIN: Update exam
---------------------------- */
router.put("/:id", ownerCheck, async (req, res) => {
  const exam = await Exam.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(exam);
});

/* ---------------------------
   ADMIN: Delete exam
---------------------------- */
router.delete("/:id", ownerCheck, async (req, res) => {
  await Exam.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

/* ---------------------------
   ADMIN: Toggle lock
---------------------------- */
router.post("/:id/toggle-lock", ownerCheck, async (req, res) => {
  const exam = await Exam.findById(req.params.id);
  exam.isLocked = !exam.isLocked;
  await exam.save();
  res.json(exam);
});

module.exports = router;
