const News = require("../models/NewsItem");

// GET /api/news
exports.list = async (req, res) => {
  try {
    const news = await News.find().sort({ createdAt: -1 });
    res.json(news);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

// POST /api/news
exports.create = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "Image is required" });
    }

    const imageUrl = `/uploads/images/${req.file.filename}`;
    const { link } = req.body;

    const newNews = new News({
      link,
      imageUrl,
      createdAt: new Date(),
    });

    await newNews.save();
    res.status(201).json(newNews);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

// DELETE /api/news/:id
exports.remove = async (req, res) => {
  try {
    const deletedNews = await News.findByIdAndDelete(req.params.id);
    if (!deletedNews) {
      return res.status(404).json({ error: "News not found" });
    }
    res.json({ message: "News deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
