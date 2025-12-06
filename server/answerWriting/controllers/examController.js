const Exam = require("../models/Exam");
const Unit = require("../models/Unit");
const Topic = require("../models/Topic");
const Subtopic = require("../models/Subtopic");
const Question = require("../models/Question");

exports.createExam = async (req, res) => {
  try {
    const exam = await Exam.create(req.body);
    res.json(exam);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
};

exports.getAllExams = async (req, res) => {
  const exams = await Exam.find();
  res.json(exams);
};

exports.getExamDetail = async (req, res) => {
  const examId = req.params.examId;

  const units = await Unit.find({ examId }).lean();

  for (let unit of units) {
    const topics = await Topic.find({ unitId: unit._id }).lean();

    for (let topic of topics) {
      const subtopics = await Subtopic.find({ topicId: topic._id }).lean();

      for (let sub of subtopics) {
        sub.questions = await Question.find({ subtopicId: sub._id }).lean();
      }

      topic.subtopics = subtopics;
    }

    unit.topics = topics;
  }

  res.json({ examId, units });
};
