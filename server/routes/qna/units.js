import express from "express";
import Unit from "../../models/qna/Unit.js";

const router = express.Router();

/* GET units for exam */
router.get("/exams/:examId/units", async (req, res) => {
  try {
    const units = await Unit.find({ examId: req.params.examId }).sort({ order: 1 });
    res.json(units);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* POST create unit */
router.post("/exams/:examId/units", async (req, res) => {
  try {
    const unit = await Unit.create({
      examId: req.params.examId,
      name: req.body.name
    });
    res.status(201).json(unit);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

/* PUT update unit */
router.put("/units/:id", async (req, res) => {
  try {
    const unit = await Unit.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(unit);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

/* DELETE unit */
router.delete("/units/:id", async (req, res) => {
  try {
    await Unit.findByIdAndDelete(req.params.id);
    res.json({ message: "Unit deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
