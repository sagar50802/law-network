const mongoose = require('mongoose');

const topicSchema = new mongoose.Schema({
  unitId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Unit',
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
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard'],
    default: 'medium'
  },
  estimatedTime: {
    type: Number, // in minutes
    default: 60
  },
  totalSubtopics: {
    type: Number,
    default: 0
  },
  totalQuestions: {
    type: Number,
    default: 0
  },
  completedQuestions: {
    type: Number,
    default: 0
  },
  dependencies: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Topic'
  }],
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

topicSchema.virtual('subtopics', {
  ref: 'Subtopic',
  localField: '_id',
  foreignField: 'topicId'
});

module.exports = mongoose.model('Topic', topicSchema);
