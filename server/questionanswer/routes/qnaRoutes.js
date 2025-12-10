/* ----------------------------------------------------------------------------------
   ✅ QnA Routes - FINAL VERSION (NO BROKEN IMPORTS)
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
/* 📌 CONTROLLERS (CORRECT IMPORTS ONLY)                                     */
/* -------------------------------------------------------------------------- */

// Exam Controller - ONLY THESE 3 FUNCTIONS EXIST
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
/* 📌 STUDENT ROUTES                                                          */
/* -------------------------------------------------------------------------- */

// 1. Exams list
router.get('/exams', getExams);

// 2. Syllabus tree
router.get('/syllabus/:examId', getSyllabusTree);

// 3. Get question (with access control)
router.get(
  '/question/:questionId',
  preventDirectAccess,
  checkContentAccess,
  trackProgress,
  getQuestion
);

// 4. Save progress
router.post('/progress', saveProgress);

// 5. Get user progress
router.get('/progress', getUserProgress);

/* -------------------------------------------------------------------------- */
/* 📌 RECOMMENDATIONS                                                         */
/* -------------------------------------------------------------------------- */

// 6. Get smart recommendations
router.get('/recommendations', getRecommendations);

// 7. Record user action for ML
router.post('/recommendations/action', recordUserAction);

/* -------------------------------------------------------------------------- */
/* 📌 TOPIC NAVIGATION                                                        */
/* -------------------------------------------------------------------------- */

// 8. Get next topics
router.get('/topics/next/:topicId', validateNavigation);

// 9. Get dependent topics
router.get('/topics/dependent/:subtopicId', validateNavigation);

/* -------------------------------------------------------------------------- */
/* 📌 ADMIN ROUTES                                                            */
/* -------------------------------------------------------------------------- */

// 10. Get scheduled questions (admin)
router.get('/admin/questions', getScheduledQuestions);

// 11. Create question (admin)
router.post('/admin/questions', createQuestion);

// 12. Schedule question (admin)
router.post('/admin/questions/:questionId/schedule', scheduleQuestion);

// 13. Delete question (admin)
router.delete('/admin/questions/:questionId', deleteQuestion);

// 14. Get analytics (admin)
router.get('/admin/analytics', getAnalytics);

/* -------------------------------------------------------------------------- */
/* 📌 EXPORT                                                                  */
/* -------------------------------------------------------------------------- */
export default router;
