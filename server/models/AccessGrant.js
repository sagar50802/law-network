const mongoose = require('mongoose');

const accessGrantSchema = new mongoose.Schema({
  gmail: { type: String, required: true },
  context: {
    type: { type: String, required: true },
    id: { type: String },
    playlist: { type: String },
    subject: { type: String },
  },
  expireAt: { type: Date, required: true },
});

accessGrantSchema.index({ expireAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('AccessGrant', accessGrantSchema);