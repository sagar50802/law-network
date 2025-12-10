/* ----------------------------------------------------------------------------------
   ✅ QnA Routes (Answer Writing System) - COMPLETE & FIXED
---------------------------------------------------------------------------------- */

import express from 'express';
import {
  validateSyllabusNavigation,
  checkContentAccess,
  trackProgress,
  preventDirectAccess,
} from '../middlewares/validateAccess.js';

const router = express.Router();

/* -------------------------------------------------------------------------- */
/* 📌 CONTROLLERS                                                              */
/* -------------------------------------------------------------------------- */

// Exam Controller
import {
  getExams,
  getSyllabusTree,
  validateNavigation,
} from '../controllers/qnaExamController.js';

// Question Controller
import {
  getQuestion,
  saveProgress,
  getUserProgress,
} from '../controllers/qnaQuestionController.js';

// Recommendation Controller
import {
  getRecommendations,
  recordUserAction,
} from '../controllers/qnaRecommendationController.js';

// Admin Controller
import {
  createQuestion,
  scheduleQuestion,
  getScheduledQuestions,
  deleteQuestion,
  getAnalytics,
} from '../controllers/adminController.js';

/* -------------------------------------------------------------------------- */
/* 📌 PUBLIC ROUTES — STUDENT ACCESS                                          */
/* -------------------------------------------------------------------------- */

// 1. Get all exams
router.get('/exams', getExams);

// 2. Get syllabus tree for an exam
router.get('/syllabus/:examId', getSyllabusTree);

// 3. Get a specific question (with validation middleware)
router.get(
  '/question/:questionId',
  preventDirectAccess,
  checkContentAccess,
  trackProgress,
  getQuestion
);

// 4. Save progress for a question
router.post('/progress', saveProgress);

// 5. Get user's progress
router.get('/progress', getUserProgress);

/* -------------------------------------------------------------------------- */
/* 📌 RECOMMENDATIONS                                                          */
/* -------------------------------------------------------------------------- */

// 6. Get recommendations based on current topic
router.get('/recommendations', getRecommendations);

// 7. Record user action for recommendation engine
router.post('/recommendations/action', recordUserAction);

/* -------------------------------------------------------------------------- */
/* 📌 TOPIC NAVIGATION                                                         */
/* -------------------------------------------------------------------------- */

// 8. Get next topics in syllabus order
router.get('/topics/next/:topicId', validateNavigation);

// 9. Get topics dependent on completed subtopic
router.get('/topics/dependent/:subtopicId', validateNavigation);

/* -------------------------------------------------------------------------- */
/* 📌 ADMIN ROUTES — PROTECTED                                                */
/* -------------------------------------------------------------------------- */

// 10. Get all scheduled questions (admin only)
router.get('/admin/questions', getScheduledQuestions);

// 11. Create a new question (admin only)
router.post('/admin/questions', createQuestion);

// 12. Schedule question release (admin only)
router.post('/admin/questions/:questionId/schedule', scheduleQuestion);

// 13. Delete a question (admin only)
router.delete('/admin/questions/:questionId', deleteQuestion);

// 14. Get admin analytics (admin only)
router.get('/admin/analytics', getAnalytics);

export default router;
