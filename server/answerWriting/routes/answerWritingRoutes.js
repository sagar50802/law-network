import express from "express";

import {
  createExam, getExams, getExamDetail
} from "../controllers/examController.js";

import {
  createUnit
} from "../controllers/unitController.js";

import {
  createTopic
} from "../controllers/topicController.js";

import {
  createSubtopic
} from "../controllers/subtopicController.js";

import {
  createQuestion
} from "../controllers/questionController.js";

const router = express.Router();

/* Exams */
router.post("/exams", createExam);
router.get("/exams", getExams);
router.get("/exams/:examId", getExamDetail);

/* Units */
router.post("/exams/:examId/units", createUnit);

/* Topics */
router.post("/units/:unitId/topics", createTopic);

/* Subtopics */
router.post("/topics/:topicId/subtopics", createSubtopic);

/* Questions */
router.post("/exams/:examId/questions", createQuestion);

export default router;
