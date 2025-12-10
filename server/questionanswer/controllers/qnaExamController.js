/* ----------------------------------------------------------------------------------
   ✅ QnA Exam Controller - COMPLETE & FIXED
---------------------------------------------------------------------------------- */

import Exam from '../models/Exam.js';
import Unit from '../models/Unit.js';
import Topic from '../models/Topic.js';
import Subtopic from '../models/Subtopic.js';
import Question from '../models/Question.js';
import Progress from '../models/Progress.js';

/* ============================================================================
   📌 1. GET ALL EXAMS
   Endpoint: GET /api/qna/exams
============================================================================ */
export const getExams = async (req, res) => {
  try {
    const exams = await Exam.find({ isActive: true })
      .select('name nameHindi description icon totalQuestions')
      .sort({ createdAt: 1 });

    // Add progress for logged-in users
    if (req.user) {
      const progress = await Progress.findOne({ userId: req.user.id });
      exams.forEach((exam) => {
        if (progress) {
          const completedCount = progress.completedQuestions.filter(
            (q) => q.examId?.toString() === exam._id.toString()
          ).length;
          exam._doc.completedCount = completedCount;
        }
      });
    }

    res.json(exams);
  } catch (error) {
    console.error('❌ Error fetching exams:', error);
    res.status(500).json({ error: 'Failed to fetch exams' });
  }
};

/* ============================================================================
   📌 2. GET SYLLABUS TREE FOR AN EXAM
   Endpoint: GET /api/qna/syllabus/:examId
============================================================================ */
export const getSyllabusTree = async (req, res) => {
  try {
    const { examId } = req.params;

    // Get all units for this exam
    const units = await Unit.find({ examId })
      .select('order name nameHindi description totalQuestions completedQuestions isLocked')
      .sort('order')
      .lean();

    // For each unit, get topics
    for (let unit of units) {
      unit.topics = await Topic.find({ unitId: unit._id })
        .select('order name nameHindi difficulty estimatedTime totalQuestions completedQuestions isLocked dependencies')
        .sort('order')
        .lean();

      // For each topic, get subtopics
      for (let topic of unit.topics) {
        topic.subtopics = await Subtopic.find({ topicId: topic._id })
          .select('order name nameHindi totalQuestions completedQuestions isLocked')
          .sort('order')
          .lean();

        // For each subtopic, get questions
        for (let subtopic of topic.subtopics) {
          subtopic.questions = await Question.find({
            subtopicId: subtopic._id,
            isReleased: true,
          })
            .select('order questionHindi questionEnglish isPremium')
            .sort('order')
            .lean();
        }
      }
    }

    res.json(units);
  } catch (error) {
    console.error('❌ Error fetching syllabus tree:', error);
    res.status(500).json({ error: 'Failed to fetch syllabus tree' });
  }
};

/* ============================================================================
   📌 3. VALIDATE SYLLABUS NAVIGATION
   Endpoint: Used as middleware for /topics/next/:topicId and /topics/dependent/:subtopicId
============================================================================ */
export const validateNavigation = async (req, res, next) => {
  try {
    const { examId, unitId, topicId, subtopicId, questionId } = req.query;

    // If trying to access question directly, redirect to syllabus
    if (questionId && (!examId || !unitId || !topicId || !subtopicId)) {
      return res.status(400).json({
        error: 'Direct question access not allowed. Please navigate through syllabus.',
        redirect: true,
      });
    }

    // Validate the navigation path
    if (subtopicId) {
      const subtopic = await Subtopic.findById(subtopicId)
        .populate('topicId', 'unitId')
        .populate('topicId.unitId', 'examId');

      if (!subtopic) {
        return res.status(404).json({ error: 'Subtopic not found' });
      }

      // Check if the path is correct
      if (topicId && subtopic.topicId._id.toString() !== topicId) {
        return res.status(400).json({ error: 'Invalid navigation path' });
      }
    }

    next();
  } catch (error) {
    console.error('❌ Error validating navigation:', error);
    res.status(500).json({ error: 'Navigation validation failed' });
  }
};

/* ============================================================================
   📌 4. GET EXAM PROGRESS (REMOVED - NOT NEEDED)
   Note: This function was removed because progress is handled in qnaQuestionController.js
   Use GET /api/qna/progress instead for user progress
============================================================================ */
