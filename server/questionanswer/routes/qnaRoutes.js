/* ----------------------------------------------------------------------------------
   QnA Routes (Answer Writing System)
---------------------------------------------------------------------------------- */
import express from 'express';
import { 
  validateSyllabusNavigation, 
  checkContentAccess,
  trackProgress,
  preventDirectAccess 
} from '../middlewares/validateAccess.js';

const router = express.Router();

/* Controllers */
import { 
  getExams, 
  getSyllabusTree, 
  validateNavigation, 
  getExamProgress 
} from '../controllers/qnaExamController.js';

import { 
  getQuestion, 
  saveProgress, 
  getUserProgress 
} from '../controllers/qnaQuestionController.js';

import { 
  getRecommendations, 
  recordUserAction 
} from '../controllers/qnaRecommendationController.js';

import { 
  createQuestion,
  scheduleQuestion,
  getScheduledQuestions,
  deleteQuestion,
  getAnalytics
} from '../controllers/adminController.js';

/* -------------------------------------------------------------------------- */
/* PUBLIC ROUTES — MUST MATCH FRONTEND EXACTLY                                */
/* -------------------------------------------------------------------------- */

router.get("/exams", getExams);
router.get("/syllabus/:examId", getSyllabusTree);

/* Frontend expects GET /qna/question/:id */
router.get(
  "/question/:questionId",
  preventDirectAccess,
  checkContentAccess,
  trackProgress,
  getQuestion
);

/* Student Progress */
router.get("/progress", getUserProgress);
router.post("/progress", saveProgress);

/* -------------------------------------------------------------------------- */
/* RECOMMENDATIONS                                                            */
/* -------------------------------------------------------------------------- */
router.get("/recommendations", getRecommendations);
router.post("/recommendations/action", recordUserAction);

/* -------------------------------------------------------------------------- */
/* TOPIC NAVIGATION                                                           */
/* -------------------------------------------------------------------------- */
router.get("/topics/next/:topicId", validateNavigation);
router.get("/topics/dependent/:subtopicId", validateNavigation);

/* -------------------------------------------------------------------------- */
/* ADMIN ROUTES — CLEAN & CORRECT                                            */
/* -------------------------------------------------------------------------- */
router.get("/admin/questions", getScheduledQuestions);
router.post("/admin/questions", createQuestion);
router.post("/admin/questions/:questionId/schedule", scheduleQuestion);
router.delete("/admin/questions/:questionId", deleteQuestion);
router.get("/admin/analytics", getAnalytics);

export default router;
