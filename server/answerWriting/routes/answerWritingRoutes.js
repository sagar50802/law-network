const router = require("express").Router();

const exam = require("../controllers/examController");
const unit = require("../controllers/unitController");
const topic = require("../controllers/topicController");
const subtopic = require("../controllers/subtopicController");
const question = require("../controllers/questionController");
const student = require("../controllers/studentController");

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

module.exports = router;
