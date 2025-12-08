import express from "express";
const router = express.Router();

// Controllers
import qnaExamController from "../controllers/qnaExamController.js";
import qnaQuestionController from "../controllers/qnaQuestionController.js";
import qnaRecommendationController from "../controllers/qnaRecommendationController.js";
import adminController from "../controllers/adminController.js";

// Middlewares
import {
  validateSyllabusNavigation,
  checkContentAccess,
  trackProgress,
  preventDirectAccess
} from "../middlewares/validateAccess.js";

// Public routes
router.get("/exams", qnaExamController.getExams);
router.get("/syllabus/:examId", qnaExamController.getSyllabusTree);
router.get("/progress/:examId", qnaExamController.getExamProgress);

// Question routes
router.get(
  "/questions/:questionId",
  preventDirectAccess,
  checkContentAccess,
  trackProgress,
  qnaQuestionController.getQuestion
);

// Progress
router.post("/progress/:questionId", qnaQuestionController.saveProgress);
router.get("/user/progress", qnaQuestionController.getUserProgress);

// Recommendations
router.get("/recommendations", qnaRecommendationController.getRecommendations);
router.post("/recommendations/action", qnaRecommendationController.recordUserAction);

// Admin routes
router.post("/admin/exams", adminController.createExam);
router.post("/admin/syllabus", adminController.createSyllabusNode);
router.post("/admin/questions", adminController.createQuestion);
router.post("/admin/questions/:questionId/schedule", adminController.scheduleQuestion);
router.get("/admin/scheduled", adminController.getScheduledQuestions);
router.get("/admin/analytics", adminController.getAnalytics);

export default router;
