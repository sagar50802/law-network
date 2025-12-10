/* ----------------------------------------------------------------------------------
   QnA Routes (Answer Writing System)
   Base path from server: /api/qna/...
---------------------------------------------------------------------------------- */

import express from "express";
import {
  validateSyllabusNavigation,
  checkContentAccess,
  trackProgress,
  preventDirectAccess,
} from "../middlewares/validateAccess.js";

/* Controllers */
import {
  getExams,
  getSyllabusTree,
  validateNavigation,
  getExamProgress,
} from "../controllers/qnaExamController.js";

import {
  getQuestion,
  saveProgress,
  getUserProgress,
} from "../controllers/qnaQuestionController.js";

import {
  getRecommendations,
  recordUserAction,
} from "../controllers/qnaRecommendationController.js";

import {
  createQuestion,
  scheduleQuestion,
  getScheduledQuestions,
  deleteQuestion,
  getAnalytics,
} from "../controllers/adminController.js";

const router = express.Router();

/* -------------------------------------------------------------------------- */
/* PUBLIC ROUTES — MUST MATCH FRONTEND                                        */
/* -------------------------------------------------------------------------- */

router.get("/exams", getExams); // GET /api/qna/exams
router.get("/syllabus/:examId", getSyllabusTree); // GET /api/qna/syllabus/:examId

router.get(
  "/question/:questionId",
  preventDirectAccess,
  checkContentAccess,
  trackProgress,
  getQuestion
);

// Student progress
router.get("/progress", getUserProgress); // GET /api/qna/progress
router.post("/progress", saveProgress); // POST /api/qna/progress

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
/* ADMIN ROUTES                                                               */
/* Base URL: /api/qna/admin/...                                              */
/* -------------------------------------------------------------------------- */

router.get("/admin/questions", getScheduledQuestions);
router.post("/admin/questions", createQuestion);
router.post("/admin/questions/:questionId/schedule", scheduleQuestion);
router.delete("/admin/questions/:questionId", deleteQuestion);
router.get("/admin/analytics", getAnalytics);

export default router;
