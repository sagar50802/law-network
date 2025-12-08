const express = require('express');
const router = express.Router();

// Controllers
const qnaExamController = require('../controllers/qnaExamController');
const qnaQuestionController = require('../controllers/qnaQuestionController');
const qnaRecommendationController = require('../controllers/qnaRecommendationController');
const adminController = require('../controllers/adminController');

// Middlewares
const { 
  validateSyllabusNavigation, 
  checkContentAccess,
  trackProgress,
  preventDirectAccess 
} = require('../middlewares/validateAccess');

// Public routes (no auth required for basic access)
router.get('/exams', qnaExamController.getExams);
router.get('/syllabus/:examId', qnaExamController.getSyllabusTree);
router.get('/progress/:examId', qnaExamController.getExamProgress);

// Question routes with access control
router.get('/questions/:questionId', 
  preventDirectAccess,
  checkContentAccess,
  trackProgress,
  qnaQuestionController.getQuestion
);

// Progress tracking routes (require auth)
router.post('/progress/:questionId', qnaQuestionController.saveProgress);
router.get('/user/progress', qnaQuestionController.getUserProgress);

// Recommendation routes
router.get('/recommendations', qnaRecommendationController.getRecommendations);
router.post('/recommendations/action', qnaRecommendationController.recordUserAction);

// Admin routes (protected by admin middleware)
router.post('/admin/exams', adminController.createExam);
router.post('/admin/syllabus', adminController.createSyllabusNode);
router.post('/admin/questions', adminController.createQuestion);
router.post('/admin/questions/:questionId/schedule', adminController.scheduleQuestion);
router.get('/admin/scheduled', adminController.getScheduledQuestions);
router.get('/admin/analytics', adminController.getAnalytics);

// Export router
module.exports = router;
