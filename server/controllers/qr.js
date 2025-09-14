// server/routes/qr.js
const express = require('express');
const fs = require('fs');
const path = require('path');
const multer = require('multer');

const router = express.Router();

const DATA_FILE = path.join(__dirname, '..', 'data', 'qr.json');
const UP_DIR = path.join(__dirname, '..', 'uploads', 'qr');
if (!fs.existsSync(UP_DIR)) fs.mkdirSync(UP_DIR, { recursive: true });
if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify({
  url: "", // `/uploads/qr/xxx.png`
  plans: { weekly: "Weekly", monthly: "Monthly", yearly: "Yearly" }
}, null, 2));

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UP_DIR),
  filename: (req, file, cb) => cb(null, `${Date.now()}${path.extname(file.originalname)}`)
});
const upload = multer({ storage });

const isAdmin = (req, res, next) => {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  if (token !== req.ADMIN_KEY) return res.status(401).json({ success: false, message: 'Unauthorized' });
  next();
};

const readJSON = () => JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
const writeJSON = (data) => fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));

// GET current QR config
router.get('/', (req, res) => {
  res.json({ success: true, qr: readJSON() });
});

// POST update QR (image + plan texts)
router.post('/', isAdmin, upload.single('image'), (req, res) => {
  const { weekly, monthly, yearly } = req.body;
  const curr = readJSON();
  if (req.file) curr.url = `/uploads/qr/${req.file.filename}`;
  curr.plans = {
    weekly: weekly || curr.plans.weekly,
    monthly: monthly || curr.plans.monthly,
    yearly: yearly || curr.plans.yearly,
  };
  writeJSON(curr);
  res.json({ success: true, qr: curr });
});

module.exports = router;
