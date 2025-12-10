const express = require("express");
const router = express.Router();
const ownerCheck = require("../../middleware/ownerCheck");

const Unit = require("../../models/qna/Unit");

/* PUBLIC */
router.get("/exams/:examId/units", async (req, res) => {
  const units = await Unit.find({ examId: req.params.examId }).sort({ order: 1 });
  res.json(units);
});

/* ADMIN */
router.post("/exams/:examId/units", ownerCheck, async (req, res) => {
  const unit = await Unit.create({
    examId: req.params.examId,
    name: req.body.name
  });
  res.json(unit);
});

router.put("/:unitId", ownerCheck, async (req, res) => {
  const updated = await Unit.findByIdAndUpdate(req.params.unitId, req.body, { new: true });
  res.json(updated);
});

router.delete("/:unitId", ownerCheck, async (req, res) => {
  await Unit.findByIdAndDelete(req.params.unitId);
  res.json({ success: true });
});

module.exports = router;
