import { Router } from "express";

import exam from "../controllers/examController.js";
import unit from "../controllers/unitController.js";
import topic from "../controllers/topicController.js";
import subtopic from "../controllers/subtopicController.js";
import question from "../controllers/questionController.js";
import student from "../controllers/studentController.js";

const router = Router();

// Exam
router.post("/exams", exam.createExam);
router.get("/exams", exam.getAllExams);
router.get("/exams/:examId", exam.getExamDetail);

// Unit
router.post("/exams/:examId/units", unit.createUnit);

// Topic
router.post("/units/:unitId/topics", topic.createTopic);
router.patch("/topics/:topicId/lock", topic.toggleLock);

// Subtopic
router.post("/topics/:topicId/subtopics", subtopic.createSubtopic);

// Questions
router.post("/subtopics/:subtopicId/questions", question.createQuestion);
router.delete("/questions/:questionId", question.deleteQuestion);

// Student Dashboard
router.get("/student/:examId/dashboard", student.getDashboard);
router.get("/student/:examId/live-question", student.getLiveQuestion);

export default router;
