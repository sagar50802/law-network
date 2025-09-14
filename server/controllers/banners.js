const Banner = require('../models/Banner'); // Assuming a Mongoose model for Banner with fields like imageUrl, link, createdAt, etc.

exports.list = async (req, res) => {
  try {
    const banners = await Banner.find().sort({ createdAt: -1 });
    res.json(banners);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const newBanner = new Banner(req.body);
    await newBanner.save();
    res.status(201).json(newBanner);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const deletedBanner = await Banner.findByIdAndDelete(req.params.id);
    if (!deletedBanner) {
      return res.status(404).json({ error: 'Banner not found' });
    }
    res.json({ message: 'Banner deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};