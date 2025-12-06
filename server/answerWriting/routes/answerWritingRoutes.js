import { Router } from "express";

import exam from "../controllers/examController.js";
import unit from "../controllers/unitController.js";
import topic from "../controllers/topicController.js";
import subtopic from "../controllers/subtopicController.js";
import question from "../controllers/questionController.js";
import student from "../controllers/studentController.js";

const router = Router();

/* -----------------------------------------------------------
   EXAMS
----------------------------------------------------------- */
router.post("/exams", exam.createExam);
router.get("/exams", exam.getAllExams);
router.get("/exams/:examId", exam.getExamDetail);

/* -----------------------------------------------------------
   UNITS
----------------------------------------------------------- */
router.post("/exams/:examId/units", unit.createUnit);

// ⭐ NEW — Update Unit
router.patch("/units/:unitId", unit.updateUnit);

// ⭐ NEW — Delete Unit
router.delete("/units/:unitId", unit.deleteUnit);

/* -----------------------------------------------------------
   TOPICS
----------------------------------------------------------- */
router.post("/units/:unitId/topics", topic.createTopic);

router.patch("/topics/:topicId/lock", topic.toggleLock);

// ⭐ NEW — Update Topic
router.patch("/topics/:topicId", topic.updateTopic);

// ⭐ NEW — Delete Topic
router.delete("/topics/:topicId", topic.deleteTopic);

/* -----------------------------------------------------------
   SUBTOPICS
----------------------------------------------------------- */
router.post("/topics/:topicId/subtopics", subtopic.createSubtopic);

// ⭐ NEW — Update Subtopic
router.patch("/subtopics/:subtopicId", subtopic.updateSubtopic);

// ⭐ NEW — Delete Subtopic
router.delete("/subtopics/:subtopicId", subtopic.deleteSubtopic);

/* -----------------------------------------------------------
   QUESTIONS
----------------------------------------------------------- */
router.post("/subtopics/:subtopicId/questions", question.createQuestion);
router.delete("/questions/:questionId", question.deleteQuestion);

/* -----------------------------------------------------------
   STUDENT DASHBOARD
----------------------------------------------------------- */
router.get("/student/:examId/dashboard", student.getDashboard);
router.get("/student/:examId/live-question", student.getLiveQuestion);

export default router;
