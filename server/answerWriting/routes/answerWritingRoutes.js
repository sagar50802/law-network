import express from 'express';
import {
  getExams,
  getSyllabusTree,
  validateNavigation,
  getExamProgress
} from '../controllers/answerWritingExamController.js';
import {
  getQuestion,
  saveProgress,
  getUserProgress
} from '../controllers/answerWritingQuestionController.js';
import {
  getRecommendations,
  recordUserAction
} from '../controllers/answerWritingAdminController.js';
import {
  createExam,
  createSyllabusNode,
  createQuestion,
  scheduleQuestion,
  getScheduledQuestions,
  getAnalytics,
  updateQuestion,
  deleteQuestion
} from '../controllers/answerWritingAdminController.js';

const router = express.Router();

// Public routes
router.get('/exams', getExams);
router.get('/syllabus/:examId', validateNavigation, getSyllabusTree);
router.get('/progress/:examId', getExamProgress);
router.get('/questions/:questionId', getQuestion);
router.get('/recommendations', getRecommendations);

// User progress routes
router.post('/progress/:questionId', saveProgress);
router.get('/user/progress', getUserProgress);
router.post('/recommendations/action', recordUserAction);

// Admin routes
router.post('/admin/exams', createExam);
router.post('/admin/syllabus', createSyllabusNode);
router.post('/admin/questions', createQuestion);
router.post('/admin/questions/:questionId/schedule', scheduleQuestion);
router.get('/admin/scheduled', getScheduledQuestions);
router.get('/admin/analytics', getAnalytics);
router.put('/admin/questions/:questionId', updateQuestion);
router.delete('/admin/questions/:questionId', deleteQuestion);

export default router;
