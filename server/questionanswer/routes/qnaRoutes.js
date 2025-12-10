/* ----------------------------------------------------------------------------------
   QnA Routes (Answer Writing System)
---------------------------------------------------------------------------------- */
import express from "express";
import {
  validateSyllabusNavigation,
  checkContentAccess,
  trackProgress,
  preventDirectAccess,
} from "../middlewares/validateAccess.js";

/* Student-facing controllers */
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

/* Admin controllers */
import {
  createExam,
  createSyllabusNode,
  createQuestion,
  scheduleQuestion,
  getScheduledQuestions,
  deleteQuestion,
  getAnalytics,
  getQuestions,
} from "../controllers/adminController.js";

const router = express.Router();

/* -------------------------------------------------------------------------- */
/* PUBLIC ROUTES — MUST MATCH FRONTEND EXACTLY                                */
/* (all mounted under /api/qna in server.js)                                  */
/* -------------------------------------------------------------------------- */

// Exams & syllabus
router.get("/exams", getExams);
router.get("/syllabus/:examId", getSyllabusTree);

// Single question view
router.get(
  "/question/:questionId",
  preventDirectAccess,
  checkContentAccess,
  trackProgress,
  getQuestion
);

// Student progress
router.get("/progress", getUserProgress);
router.post("/progress", saveProgress);

// Recommendations / navigation
router.get("/recommendations", getRecommendations);
router.post("/recommendations/action", recordUserAction);

router.get("/topics/next/:topicId", validateNavigation);
router.get("/topics/dependent/:subtopicId", validateNavigation);

/* -------------------------------------------------------------------------- */
/* ADMIN ROUTES — CLEAN & CORRECT                                            */
/* (all require admin on frontend; you can add auth middleware later)        */
/* -------------------------------------------------------------------------- */

// Exams & syllabus structure
router.post("/admin/exams", createExam);          // create new exam
router.post("/admin/syllabus", createSyllabusNode); // create unit/topic/subtopic

// Questions CRUD + scheduling
router.get("/admin/questions", getQuestions);     // list/filter questions
router.post("/admin/questions", createQuestion);  // create question
router.post(
  "/admin/questions/:questionId/schedule",
  scheduleQuestion
);
router.get(
  "/admin/scheduled-questions",
  getScheduledQuestions
);
router.delete(
  "/admin/questions/:questionId",
  deleteQuestion
);

// Analytics
router.get("/admin/analytics", getAnalytics);

export default router;
