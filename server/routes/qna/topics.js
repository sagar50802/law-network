const express = require("express");
const router = express.Router();
const ownerCheck = require("../../middleware/ownerCheck");

const Topic = require("../../models/qna/Topic");

router.get("/:unitId/topics", async (req, res) => {
  const topics = await Topic.find({ unitId: req.params.unitId }).sort({ order: 1 });
  res.json(topics);
});

router.post("/:unitId/topics", ownerCheck, async (req, res) => {
  const topic = await Topic.create({
    unitId: req.params.unitId,
    name: req.body.name
  });
  res.json(topic);
});

router.put("/:id", ownerCheck, async (req, res) => {
  const updated = await Topic.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(updated);
});

router.delete("/:id", ownerCheck, async (req, res) => {
  await Topic.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

module.exports = router;
