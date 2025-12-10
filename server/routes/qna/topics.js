import express from "express";
import Topic from "../../models/qna/Topic.js";

const router = express.Router();

/* GET topics for unit */
router.get("/units/:unitId/topics", async (req, res) => {
  try {
    const topics = await Topic.find({ unitId: req.params.unitId }).sort({ order: 1 });
    res.json(topics);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

/* POST create topic */
router.post("/units/:unitId/topics", async (req, res) => {
  try {
    const topic = await Topic.create({
      unitId: req.params.unitId,
      name: req.body.name
    });
    res.status(201).json(topic);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

/* PUT update topic */
router.put("/topics/:id", async (req, res) => {
  try {
    const topic = await Topic.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(topic);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

/* DELETE topic */
router.delete("/topics/:id", async (req, res) => {
  try {
    await Topic.findByIdAndDelete(req.params.id);
    res.json({ message: "Topic deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

export default router;
