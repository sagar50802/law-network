const Pdf = require('../models/Pdf'); // Assuming a Mongoose model for Pdf with fields like title, subject, filePath, etc.

exports.list = async (req, res) => {
  try {
    const pdfs = await Pdf.find().sort({ subject: 1 });
    // Group by subject
    const groupedPdfs = pdfs.reduce((acc, pdf) => {
      const subject = pdf.subject || 'Uncategorized';
      if (!acc[subject]) {
        acc[subject] = [];
      }
      acc[subject].push(pdf);
      return acc;
    }, {});
    res.json(groupedPdfs);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

exports.create = async (req, res) => {
  try {
    const newPdf = new Pdf(req.body);
    await newPdf.save();
    res.status(201).json(newPdf);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.remove = async (req, res) => {
  try {
    const deletedPdf = await Pdf.findByIdAndDelete(req.params.id);
    if (!deletedPdf) {
      return res.status(404).json({ error: 'PDF not found' });
    }
    res.json({ message: 'PDF deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};