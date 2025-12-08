import Topic from "../models/Topic.js";
import Unit from "../models/Unit.js";

export const createTopic = async (req, res) => {
  try {
    const topic = await Topic.create({
      name: req.body.name,
      unit: req.params.unitId
    });

    await Unit.findByIdAndUpdate(req.params.unitId, {
      $push: { topics: topic._id }
    });

    res.json({ success: true, topic });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
