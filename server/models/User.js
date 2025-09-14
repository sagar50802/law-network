const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'viewer'], required: true },
});

// This line will NOT overwrite the model if already compiled:
module.exports = mongoose.models.User || mongoose.model('User', userSchema);
