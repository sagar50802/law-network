const express = require("express");
const router = express.Router();
const ownerCheck = require("../../middleware/ownerCheck");

const Subtopic = require("../../models/qna/Subtopic");

router.get("/:topicId/subtopics", async (req, res) => {
  const subs = await Subtopic.find({ topicId: req.params.topicId }).sort({ order: 1 });
  res.json(subs);
});

router.post("/:topicId/subtopics", ownerCheck, async (req, res) => {
  const sub = await Subtopic.create({
    topicId: req.params.topicId,
    name: req.body.name
  });
  res.json(sub);
});

router.put("/:id", ownerCheck, async (req, res) => {
  const updated = await Subtopic.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json(updated);
});

router.delete("/:id", ownerCheck, async (req, res) => {
  await Subtopic.findByIdAndDelete(req.params.id);
  res.json({ success: true });
});

module.exports = router;
