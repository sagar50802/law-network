const Exam = require('../models/Exam');
const Unit = require('../models/Unit');
const Topic = require('../models/Topic');
const Subtopic = require('../models/Subtopic');
const Question = require('../models/Question');
const Progress = require('../models/Progress');

class QnAExamController {
  // Get all exams
  async getExams(req, res) {
    try {
      const exams = await Exam.find({ isActive: true })
        .select('name nameHindi description icon totalQuestions')
        .sort({ createdAt: 1 });
      
      // Add progress for logged-in users
      if (req.user) {
        const progress = await Progress.findOne({ userId: req.user.id });
        exams.forEach(exam => {
          if (progress) {
            exam.completedCount = progress.completedQuestions.filter(q => 
              q.examId?.toString() === exam._id.toString()
            ).length;
          }
        });
      }
      
      res.json(exams);
    } catch (error) {
      console.error('Error fetching exams:', error);
      res.status(500).json({ error: 'Failed to fetch exams' });
    }
  }

  // Get syllabus tree for an exam
  async getSyllabusTree(req, res) {
    try {
      const { examId } = req.params;
      
      // Get all units for this exam
      const units = await Unit.find({ examId })
        .select('order name nameHindi description totalQuestions completedQuestions isLocked')
        .sort('order')
        .lean();
      
      // For each unit, get topics
      for (let unit of units) {
        unit.topics = await Topic.find({ unitId: unit._id })
          .select('order name nameHindi difficulty estimatedTime totalQuestions completedQuestions isLocked dependencies')
          .sort('order')
          .lean();
        
        // For each topic, get subtopics
        for (let topic of unit.topics) {
          topic.subtopics = await Subtopic.find({ topicId: topic._id })
            .select('order name nameHindi totalQuestions completedQuestions isLocked')
            .sort('order')
            .lean();
          
          // For each subtopic, get questions
          for (let subtopic of topic.subtopics) {
            subtopic.questions = await Question.find({ 
              subtopicId: subtopic._id,
              isReleased: true 
            })
              .select('order questionHindi questionEnglish isPremium')
              .sort('order')
              .lean();
          }
        }
      }
      
      res.json(units);
    } catch (error) {
      console.error('Error fetching syllabus tree:', error);
      res.status(500).json({ error: 'Failed to fetch syllabus tree' });
    }
  }

  // Validate syllabus navigation
  async validateNavigation(req, res, next) {
    try {
      const { examId, unitId, topicId, subtopicId, questionId } = req.query;
      
      // If trying to access question directly, redirect to syllabus
      if (questionId && (!examId || !unitId || !topicId || !subtopicId)) {
        return res.status(400).json({ 
          error: 'Direct question access not allowed. Please navigate through syllabus.',
          redirect: true 
        });
      }
      
      // Validate the navigation path
      if (subtopicId) {
        const subtopic = await Subtopic.findById(subtopicId)
          .populate('topicId', 'unitId')
          .populate('topicId.unitId', 'examId');
        
        if (!subtopic) {
          return res.status(404).json({ error: 'Subtopic not found' });
        }
        
        // Check if the path is correct
        if (topicId && subtopic.topicId._id.toString() !== topicId) {
          return res.status(400).json({ error: 'Invalid navigation path' });
        }
      }
      
      next();
    } catch (error) {
      console.error('Error validating navigation:', error);
      res.status(500).json({ error: 'Navigation validation failed' });
    }
  }

  // Get exam progress
  async getExamProgress(req, res) {
    try {
      const { examId } = req.params;
      const userId = req.user?.id;
      
      if (!userId) {
        return res.json({ totalQuestions: 0, completedQuestions: 0 });
      }
      
      const progress = await Progress.findOne({ userId, examId });
      
      if (!progress) {
        return res.json({ totalQuestions: 0, completedQuestions: 0 });
      }
      
      // Get total questions count for this exam
      const totalQuestions = await Question.countDocuments({ examId, isReleased: true });
      
      res.json({
        totalQuestions,
        completedQuestions: progress.completedQuestions.length,
        lastActive: progress.lastActive,
        streak: progress.streak,
        totalTimeSpent: progress.totalTimeSpent
      });
    } catch (error) {
      console.error('Error fetching exam progress:', error);
      res.status(500).json({ error: 'Failed to fetch progress' });
    }
  }
}

module.exports = new QnAExamController();
