/* ----------------------------------------------------------------------------------
   ✅ QnA Exam Controller - FINAL VERSION (EXPORTS MATCH IMPORTS)
---------------------------------------------------------------------------------- */
import Exam from '../models/Exam.js';
import Unit from '../models/Unit.js';
import Topic from '../models/Topic.js';
import Subtopic from '../models/Subtopic.js';
import Question from '../models/Question.js';
import Progress from '../models/Progress.js';

/* ============================================================================
   📌 1. GET ALL EXAMS (PUBLIC)
   Endpoint: GET /api/qna/exams
   Returns: List of active exams with progress for logged-in users
============================================================================ */
export const getExams = async (req, res) => {
  try {
    console.log('📚 Fetching exams...');
    
    // Get all active exams
    const exams = await Exam.find({ isActive: true })
      .select('name nameHindi description icon totalQuestions createdAt')
      .sort({ createdAt: 1 })
      .lean();

    // Add progress for logged-in users
    if (req.user && req.user.id) {
      try {
        const progress = await Progress.findOne({ userId: req.user.id });
        if (progress) {
          exams.forEach((exam) => {
            const completedInExam = progress.completedQuestions.filter(
              (q) => q.examId?.toString() === exam._id.toString()
            ).length;
            exam.completedCount = completedInExam;
          });
        }
      } catch (progressErr) {
        console.log('⚠️ Could not load progress:', progressErr.message);
      }
    }

    console.log(`✅ Found ${exams.length} exams`);
    res.json(exams);
  } catch (error) {
    console.error('❌ Error fetching exams:', error);
    res.status(500).json({ 
      error: 'Failed to fetch exams',
      details: error.message 
    });
  }
};

/* ============================================================================
   📌 2. GET SYLLABUS TREE (PUBLIC)
   Endpoint: GET /api/qna/syllabus/:examId
   Returns: Complete tree structure (Unit → Topic → Subtopic → Questions)
============================================================================ */
export const getSyllabusTree = async (req, res) => {
  try {
    const { examId } = req.params;
    console.log(`📚 Fetching syllabus for exam: ${examId}`);

    // 1. Verify exam exists
    const exam = await Exam.findById(examId);
    if (!exam) {
      return res.status(404).json({ error: 'Exam not found' });
    }

    // 2. Get all units for this exam
    const units = await Unit.find({ examId })
      .select('order name nameHindi description totalQuestions isLocked')
      .sort('order')
      .lean();

    console.log(`📁 Found ${units.length} units`);

    // 3. For each unit, get topics
    for (let unit of units) {
      unit.topics = await Topic.find({ unitId: unit._id })
        .select('order name nameHindi difficulty estimatedTime totalQuestions isLocked dependencies')
        .sort('order')
        .lean();

      // 4. For each topic, get subtopics
      for (let topic of unit.topics) {
        topic.subtopics = await Subtopic.find({ topicId: topic._id })
          .select('order name nameHindi totalQuestions isLocked')
          .sort('order')
          .lean();

        // 5. For each subtopic, get released questions
        for (let subtopic of topic.subtopics) {
          subtopic.questions = await Question.find({
            subtopicId: subtopic._id,
            isReleased: true,
          })
            .select('order questionHindi questionEnglish isPremium difficulty')
            .sort('order')
            .limit(20) // Limit for performance
            .lean();
        }
      }
    }

    console.log(`✅ Syllabus tree built successfully`);
    res.json(units);
  } catch (error) {
    console.error('❌ Error fetching syllabus tree:', error);
    res.status(500).json({ 
      error: 'Failed to fetch syllabus tree',
      details: error.message 
    });
  }
};

/* ============================================================================
   📌 3. VALIDATE NAVIGATION PATH (MIDDLEWARE)
   Used by: /topics/next/:topicId and /topics/dependent/:subtopicId
   Ensures users navigate correctly through syllabus
============================================================================ */
export const validateNavigation = async (req, res, next) => {
  try {
    const { examId, unitId, topicId, subtopicId } = req.query;
    const { topicId: paramTopicId, subtopicId: paramSubtopicId } = req.params;

    console.log(`🔍 Validating navigation path...`);

    // If accessing through params
    const currentTopicId = paramTopicId || topicId;
    const currentSubtopicId = paramSubtopicId || subtopicId;

    // Validate subtopic exists and belongs to correct topic
    if (currentSubtopicId) {
      const subtopic = await Subtopic.findById(currentSubtopicId)
        .populate('topicId', 'unitId')
        .populate('topicId.unitId', 'examId');

      if (!subtopic) {
        return res.status(404).json({ error: 'Subtopic not found' });
      }

      // If topicId provided, verify it matches
      if (currentTopicId && subtopic.topicId._id.toString() !== currentTopicId) {
        return res.status(400).json({ 
          error: 'Invalid navigation path',
          message: 'Subtopic does not belong to the specified topic'
        });
      }
    }

    console.log(`✅ Navigation validated successfully`);
    next();
  } catch (error) {
    console.error('❌ Error validating navigation:', error);
    res.status(500).json({ 
      error: 'Navigation validation failed',
      details: error.message 
    });
  }
};

/* ============================================================================
   📌 EXPORTS (ONLY THESE 3 FUNCTIONS - MATCHES ROUTES IMPORT)
============================================================================ */
export {
  getExams,
  getSyllabusTree,
  validateNavigation,
};
