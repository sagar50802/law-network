const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema({
  name: { type: String, required: true },
  number: { type: String, required: true },
  gmail: { type: String, required: true },
  planKey: { type: String, required: true },
  context: {
    type: { type: String, required: true },
    id: { type: String },
    playlist: { type: String },
    subject: { type: String },
  },
  screenshotPath: { type: String, required: true },
  status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
});

submissionSchema.index({ gmail: 1, 'context.type': 1, 'context.id': 1, 'context.playlist': 1, 'context.subject': 1 });

module.exports = mongoose.model('Submission', submissionSchema);