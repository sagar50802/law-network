const mongoose = require('mongoose');

const subtopicSchema = new mongoose.Schema({
  topicId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Topic',
    required: true
  },
  order: {
    type: Number,
    required: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  nameHindi: {
    type: String,
    required: true
  },
  description: {
    type: String,
    trim: true
  },
  totalQuestions: {
    type: Number,
    default: 0
  },
  completedQuestions: {
    type: Number,
    default: 0
  },
  isLocked: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

subtopicSchema.virtual('questions', {
  ref: 'Question',
  localField: '_id',
  foreignField: 'subtopicId'
});

export default mongoose.model('Exam', examSchema);
