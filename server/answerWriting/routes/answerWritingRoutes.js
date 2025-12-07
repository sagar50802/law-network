// answerWriting/routes/answerWritingRoutes.js
import express from "express";
import {
  createExam,
  getExams,
  getExamDetail,
} from "../controllers/examController.js";

import {
  createUnit,
  deleteUnit,
  updateUnit,
} from "../controllers/unitController.js";

import {
  createTopic,
  deleteTopic,
  updateTopic,
} from "../controllers/topicController.js";

import {
  createSubtopic,
  deleteSubtopic,
  updateSubtopic,
} from "../controllers/subtopicController.js";

import {
  createQuestion,
  deleteQuestion,
  getReleasedQuestions,
} from "../controllers/questionController.js";

const router = express.Router();

/* ---------------- EXAMS ---------------- */
router.post("/exams", createExam);
router.get("/exams", getExams);
router.get("/exams/:examId", getExamDetail);

/* ---------------- UNITS ---------------- */
router.post("/units/:examId", createUnit);
router.put("/units/:unitId", updateUnit);
router.delete("/units/:unitId", deleteUnit);

/* ---------------- TOPICS ---------------- */
router.post("/topics/:unitId", createTopic);
router.put("/topics/:topicId", updateTopic);
router.delete("/topics/:topicId", deleteTopic);

/* ---------------- SUBTOPICS ---------------- */
router.post("/subtopics/:topicId", createSubtopic);
router.put("/subtopics/:subtopicId", updateSubtopic);
router.delete("/subtopics/:subtopicId", deleteSubtopic);

/* ---------------- QUESTIONS ---------------- */
router.post("/questions/:examId", createQuestion);
router.delete("/questions/:questionId", deleteQuestion);

/* ---- Students Only See Released Questions ---- */
router.get("/released/:examId", getReleasedQuestions);

export default router;
