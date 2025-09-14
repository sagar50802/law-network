const Article = require('../models/Article');

const list = async (req, res) => {
  try {
    const limit = req.query.limit ? parseInt(req.query.limit, 10) : 0;
    const articles = await Article.find().sort('-createdAt').limit(limit);
    res.json(articles);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const create = async (req, res) => {
  try {
    const { title, html, text } = req.body;
    let imageUrl = '';
    if (req.file) {
      imageUrl = `/uploads/articles/${req.file.filename}`;
    }
    const article = new Article({ title, html, text, imageUrl });
    await article.save();
    res.json(article);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const update = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, html, text } = req.body;
    const updateData = { title, html, text };
    if (req.file) {
      updateData.imageUrl = `/uploads/articles/${req.file.filename}`;
    }
    const article = await Article.findByIdAndUpdate(id, updateData, { new: true });
    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }
    res.json(article);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

const remove = async (req, res) => {
  try {
    const { id } = req.params;
    const article = await Article.findByIdAndDelete(id);
    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }
    res.json({ message: 'Article deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

module.exports = { list, create, update, remove };