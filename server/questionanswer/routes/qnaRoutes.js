/* ----------------------------------------------------------------------------------
   ✅ QnA Routes (Answer Writing & Reading System)
---------------------------------------------------------------------------------- */
import express from 'express';
import { 
  validateSyllabusNavigation, 
  checkContentAccess,
  trackProgress,
  preventDirectAccess 
} from '../middlewares/validateAccess.js';

const router = express.Router();

// Import controllers
import { getExams, getSyllabusTree, validateNavigation, getExamProgress } from '../controllers/qnaExamController.js';
import { getQuestion, saveProgress, getUserProgress } from '../controllers/qnaQuestionController.js';
import { getRecommendations, recordUserAction } from '../controllers/qnaRecommendationController.js';
import { 
  createExam, 
  createSyllabusNode, 
  createQuestion, 
  scheduleQuestion, 
  getScheduledQuestions, 
  getAnalytics 
} from '../controllers/adminController.js';

/* -------------------------------------------------------------------------- */
/* 📌 Public Routes (no auth required for basic access)                      */
/* -------------------------------------------------------------------------- */
router.get('/exams', getExams);
router.get('/syllabus/:examId', getSyllabusTree);
router.get('/progress/:examId', getExamProgress);

/* -------------------------------------------------------------------------- */
/* 📌 Question Routes with Access Control                                    */
/* -------------------------------------------------------------------------- */
router.get('/questions/:questionId', 
  preventDirectAccess,
  checkContentAccess,
  trackProgress,
  getQuestion
);

/* -------------------------------------------------------------------------- */
/* 📌 Progress Tracking Routes (require auth)                                */
/* -------------------------------------------------------------------------- */
router.post('/progress/:questionId', saveProgress);
router.get('/user/progress', getUserProgress);

/* -------------------------------------------------------------------------- */
/* 📌 Recommendation Routes                                                  */
/* -------------------------------------------------------------------------- */
router.get('/recommendations', getRecommendations);
router.post('/recommendations/action', recordUserAction);

/* -------------------------------------------------------------------------- */
/* 📌 Admin Routes (protected by admin middleware)                           */
/* -------------------------------------------------------------------------- */
router.post('/admin/exams', createExam);
router.post('/admin/syllabus', createSyllabusNode);
router.post('/admin/questions', createQuestion);
router.post('/admin/questions/:questionId/schedule', scheduleQuestion);
router.get('/admin/scheduled', getScheduledQuestions);
router.get('/admin/analytics', getAnalytics);

export default router;
