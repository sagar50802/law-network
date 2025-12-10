/* ----------------------------------------------------------------------------------
   ✅ QnA Admin Controller - FINAL VERSION
   Handles: Create questions, schedule, delete, analytics
---------------------------------------------------------------------------------- */
import Exam from '../models/Exam.js';
import Unit from '../models/Unit.js';
import Topic from '../models/Topic.js';
import Subtopic from '../models/Subtopic.js';
import Question from '../models/Question.js';
import Progress from '../models/Progress.js';

/* ============================================================================
   📌 1. CREATE EXAM (ADMIN)
   Endpoint: POST /api/qna/admin/exams
   Creates a new exam for QnA system
============================================================================ */
export const createExam = async (req, res) => {
  try {
    const { name, nameHindi, description, icon } = req.body;

    // Validate required fields
    if (!name || !nameHindi) {
      return res.status(400).json({ error: 'Name and Hindi name are required' });
    }

    const exam = new Exam({
      name,
      nameHindi,
      description: description || '',
      icon: icon || '⚖️',
      isActive: true,
    });

    await exam.save();
    console.log(`✅ Exam created: ${exam.name} (ID: ${exam._id})`);
    
    res.json({ 
      success: true, 
      exam,
      message: 'Exam created successfully'
    });
  } catch (error) {
    console.error('❌ Error creating exam:', error);
    res.status(500).json({ 
      error: 'Failed to create exam',
      details: error.message 
    });
  }
};

/* ============================================================================
   📌 2. CREATE QUESTION (ADMIN)
   Endpoint: POST /api/qna/admin/questions
   Creates bilingual question (Hindi + English)
============================================================================ */
export const createQuestion = async (req, res) => {
  try {
    const {
      subtopicId,
      questionHindi,
      questionEnglish,
      answerHindi,
      answerEnglish,
      difficulty,
      keywords,
      caseLaws,
      scheduledRelease,
      isPremium,
    } = req.body;

    console.log(`📝 Creating question for subtopic: ${subtopicId}`);

    // Validate required fields
    if (!subtopicId) {
      return res.status(400).json({ error: 'Subtopic ID is required' });
    }

    if (!questionHindi && !questionEnglish) {
      return res.status(400).json({ error: 'At least one language question is required' });
    }

    // Find subtopic and populate parent relationships
    const subtopic = await Subtopic.findById(subtopicId)
      .populate('topicId', 'unitId')
      .populate('topicId.unitId', 'examId');

    if (!subtopic) {
      return res.status(404).json({ error: 'Subtopic not found' });
    }

    // Get last question order in this subtopic
    const lastQuestion = await Question.findOne({ subtopicId })
      .sort({ order: -1 })
      .select('order');

    const order = lastQuestion ? lastQuestion.order + 1 : 1;

    // Create question
    const question = new Question({
      subtopicId,
      examId: subtopic.topicId?.unitId?.examId,
      unitId: subtopic.topicId?.unitId?._id,
      topicId: subtopic.topicId?._id,
      order,
      questionHindi: questionHindi || '',
      questionEnglish: questionEnglish || '',
      answerHindi: answerHindi || '',
      answerEnglish: answerEnglish || '',
      difficulty: difficulty || 'medium',
      keywords: keywords || [],
      caseLaws: caseLaws || [],
      scheduledRelease: scheduledRelease ? new Date(scheduledRelease) : null,
      isReleased: !scheduledRelease, // If scheduled, not released yet
      isPremium: isPremium || false,
    });

    await question.save();

    // Update subtopic question count
    await Subtopic.findByIdAndUpdate(subtopicId, {
      $inc: { totalQuestions: 1 },
    });

    console.log(`✅ Question created: ${question._id} (Order: ${order})`);
    
    res.json({ 
      success: true, 
      question,
      message: 'Question created successfully'
    });
  } catch (error) {
    console.error('❌ Error creating question:', error);
    res.status(500).json({ 
      error: 'Failed to create question',
      details: error.message 
    });
  }
};

/* ============================================================================
   📌 3. SCHEDULE QUESTION RELEASE (ADMIN)
   Endpoint: POST /api/qna/admin/questions/:questionId/schedule
   Sets future release time for question
============================================================================ */
export const scheduleQuestion = async (req, res) => {
  try {
    const { questionId } = req.params;
    const { scheduledRelease } = req.body;

    console.log(`⏰ Scheduling question ${questionId} for ${scheduledRelease}`);

    if (!scheduledRelease) {
      return res.status(400).json({ error: 'Release time is required' });
    }

    const releaseDate = new Date(scheduledRelease);
    if (isNaN(releaseDate.getTime())) {
      return res.status(400).json({ error: 'Invalid date format' });
    }

    const question = await Question.findByIdAndUpdate(
      questionId,
      {
        scheduledRelease: releaseDate,
        isReleased: false,
      },
      { new: true }
    );

    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }

    // Here you would add to a scheduler service
    console.log(`✅ Question ${questionId} scheduled for ${releaseDate}`);
    
    res.json({ 
      success: true, 
      question,
      message: 'Question scheduled successfully'
    });
  } catch (error) {
    console.error('❌ Error scheduling question:', error);
    res.status(500).json({ 
      error: 'Failed to schedule question',
      details: error.message 
    });
  }
};

/* ============================================================================
   📌 4. GET SCHEDULED QUESTIONS (ADMIN)
   Endpoint: GET /api/qna/admin/questions
   Returns all questions with future release dates
============================================================================ */
export const getScheduledQuestions = async (req, res) => {
  try {
    console.log('📅 Fetching scheduled questions...');

    const scheduledQuestions = await Question.find({
      scheduledRelease: { $ne: null },
      isReleased: false,
    })
      .populate('subtopicId', 'name nameHindi')
      .populate('topicId', 'name nameHindi')
      .populate('unitId', 'name nameHindi')
      .populate('examId', 'name nameHindi')
      .sort('scheduledRelease')
      .lean();

    console.log(`✅ Found ${scheduledQuestions.length} scheduled questions`);
    
    res.json(scheduledQuestions);
  } catch (error) {
    console.error('❌ Error fetching scheduled questions:', error);
    res.status(500).json({ 
      error: 'Failed to fetch scheduled questions',
      details: error.message 
    });
  }
};

/* ============================================================================
   📌 5. DELETE QUESTION (ADMIN)
   Endpoint: DELETE /api/qna/admin/questions/:questionId
   Removes question and updates counts
============================================================================ */
export const deleteQuestion = async (req, res) => {
  try {
    const { questionId } = req.params;
    console.log(`🗑️ Deleting question: ${questionId}`);

    const question = await Question.findById(questionId);
    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }

    await Question.findByIdAndDelete(questionId);

    // Update subtopic count
    await Subtopic.findByIdAndUpdate(question.subtopicId, {
      $inc: { totalQuestions: -1 },
    });

    console.log(`✅ Question ${questionId} deleted successfully`);
    
    res.json({
      success: true,
      message: 'Question deleted successfully',
      deletedId: questionId,
    });
  } catch (error) {
    console.error('❌ Error deleting question:', error);
    res.status(500).json({ 
      error: 'Failed to delete question',
      details: error.message 
    });
  }
};

/* ============================================================================
   📌 6. GET ANALYTICS (ADMIN)
   Endpoint: GET /api/qna/admin/analytics
   Returns system statistics and engagement data
============================================================================ */
export const getAnalytics = async (req, res) => {
  try {
    console.log('📊 Generating analytics...');

    const [
      totalExams,
      totalUnits,
      totalTopics,
      totalSubtopics,
      totalQuestions,
      releasedQuestions,
      premiumQuestions,
      scheduledQuestions,
    ] = await Promise.all([
      Exam.countDocuments(),
      Unit.countDocuments(),
      Topic.countDocuments(),
      Subtopic.countDocuments(),
      Question.countDocuments(),
      Question.countDocuments({ isReleased: true }),
      Question.countDocuments({ isPremium: true }),
      Question.countDocuments({ 
        scheduledRelease: { $ne: null },
        isReleased: false 
      }),
    ]);

    // Get popular questions (most views)
    const popularQuestions = await Question.find()
      .sort({ views: -1 })
      .limit(10)
      .populate('subtopicId', 'name')
      .lean();

    // Get recent questions
    const recentQuestions = await Question.find()
      .sort({ createdAt: -1 })
      .limit(10)
      .populate('subtopicId', 'name')
      .lean();

    console.log('✅ Analytics generated successfully');
    
    res.json({
      counts: {
        exams: totalExams,
        units: totalUnits,
        topics: totalTopics,
        subtopics: totalSubtopics,
        questions: totalQuestions,
        releasedQuestions,
        premiumQuestions,
        scheduledQuestions,
      },
      popularQuestions,
      recentQuestions,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('❌ Error generating analytics:', error);
    res.status(500).json({ 
      error: 'Failed to generate analytics',
      details: error.message 
    });
  }
};

/* ============================================================================
   📌 EXPORTS (MATCHES ROUTES IMPORT)
============================================================================ */
export {
  createExam,
  createQuestion,
  scheduleQuestion,
  getScheduledQuestions,
  deleteQuestion,
  getAnalytics,
};
