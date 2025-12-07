// server/answerWriting/routes/answerWritingRoutes.js
import express from "express";

import {
  createExam,
  getAllExams,
  getExamDetail,
} from "../controllers/examController.js";

import {
  createUnit,
  deleteUnit,
  updateUnit,
} from "../controllers/unitController.js";

import {
  createTopic,
  toggleLock,
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
} from "../controllers/questionController.js";

import {
  getDashboard,
  getLiveQuestion,
} from "../controllers/studentController.js";

const router = express.Router();

// Exams
router.post("/exams", createExam);
router.get("/exams", getAllExams);
router.get("/exams/:examId", getExamDetail);

// Units
router.post("/exams/:examId/units", createUnit);
router.delete("/units/:unitId", deleteUnit);
router.patch("/units/:unitId", updateUnit);

// Topics
router.post("/units/:unitId/topics", createTopic);
router.patch("/topics/:topicId/lock", toggleLock);
router.delete("/topics/:topicId", deleteTopic);
router.patch("/topics/:topicId", updateTopic);

// Subtopics
router.post("/topics/:topicId/subtopics", createSubtopic);
router.delete("/subtopics/:subtopicId", deleteSubtopic);
router.patch("/subtopics/:subtopicId", updateSubtopic);

// Questions
router.post("/subtopics/:subtopicId/questions", createQuestion);
router.delete("/questions/:questionId", deleteQuestion);

// Student-facing
router.get("/student/:examId/dashboard", getDashboard);
router.get("/student/:examId/live-question", getLiveQuestion);

export default router;
