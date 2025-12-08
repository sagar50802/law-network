const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema({
  subtopicId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subtopic',
    required: true
  },
  examId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exam',
    required: true
  },
  order: {
    type: Number,
    required: true
  },
  questionHindi: {
    type: String,
    required: true,
    trim: true
  },
  questionEnglish: {
    type: String,
    required: true,
    trim: true
  },
  answerHindi: {
    type: String,
    required: true
  },
  answerEnglish: {
    type: String,
    required: true
  },
  difficulty: {
    type: String,
    enum: ['easy', 'medium', 'hard'],
    default: 'medium'
  },
  estimatedTime: {
    type: Number, // in minutes
    default: 10
  },
  keywords: [{
    type: String,
    trim: true
  }],
  caseLaws: [{
    name: String,
    citation: String
  }],
  scheduledRelease: {
    type: Date
  },
  isReleased: {
    type: Boolean,
    default: false
  },
  isLocked: {
    type: Boolean,
    default: false
  },
  isPremium: {
    type: Boolean,
    default: false
  },
  views: {
    type: Number,
    default: 0
  },
  completionCount: {
    type: Number,
    default: 0
  },
  averageTimeSpent: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  metadata: {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: {}
  }
});

// Indexes for faster queries
questionSchema.index({ subtopicId: 1, order: 1 });
questionSchema.index({ scheduledRelease: 1 });
questionSchema.index({ isReleased: 1 });

questionSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

export default mongoose.model('Exam', examSchema);
