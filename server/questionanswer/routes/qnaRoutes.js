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
  createExam, 
  createSyllabusNode, 
  createQuestion, 
  scheduleQuestion, 
  getScheduledQuestions, 
  getAnalytics 
} from '../controllers/adminController.js';

/* -------------------------------------------------------------------------- */
/* PUBLIC ROUTES — match frontend EXACTLY                                     */
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

/* Frontend expects GET /qna/progress */
router.get("/progress", getUserProgress);

/* Frontend expects POST /qna/progress with { questionId, ...data } */
router.post("/progress", saveProgress);

/* -------------------------------------------------------------------------- */
/* RECOMMENDATIONS                                                            */
/* -------------------------------------------------------------------------- */

router.get("/recommendations", getRecommendations);
router.post("/recommendations/action", recordUserAction);

/* -------------------------------------------------------------------------- */
/* TOPIC NAVIGATION (optional, required by frontend)                          */
/* -------------------------------------------------------------------------- */

router.get("/topics/next/:topicId", validateNavigation);
router.get("/topics/dependent/:subtopicId", validateNavigation);

/* -------------------------------------------------------------------------- */
/* ADMIN ROUTES — match frontend                                             */
/* -------------------------------------------------------------------------- */

router.post("/admin/questions", createQuestion);

router.post("/admin/questions/:questionId/schedule", scheduleQuestion);

router.get("/admin/questions", getScheduledQuestions);

router.delete("/admin/questions/:questionId", createQuestion);

router.get("/admin/analytics", getAnalytics);

export default router;
