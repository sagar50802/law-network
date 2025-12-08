const mongoose = require('mongoose');

const progressSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  examId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Exam'
  },
  unitId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Unit'
  },
  topicId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Topic'
  },
  subtopicId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Subtopic'
  },
  completedQuestions: [{
    questionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Question'
    },
    completedAt: {
      type: Date,
      default: Date.now
    },
    timeSpent: Number, // in seconds
    accuracy: Number
  }],
  currentQuestion: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Question'
  },
  streak: {
    type: Number,
    default: 0
  },
  lastActive: {
    type: Date,
    default: Date.now
  },
  totalTimeSpent: {
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
  }
});

progressSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

export default mongoose.model('Exam', examSchema);
