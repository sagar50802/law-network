import Question from '../models/Question.js';
import Progress from '../models/Progress.js';

// Get question by ID
export const getQuestion = async (req, res) => {
  try {
    const { questionId } = req.params;
    const userId = req.user?.id;
    
    // Check if question exists and is released
    const question = await Question.findById(questionId)
      .populate('subtopicId', 'name nameHindi topicId')
      .populate('subtopicId.topicId', 'name nameHindi unitId')
      .populate('subtopicId.topicId.unitId', 'name nameHindi examId');
    
    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }
    
    // Check if question is released
    if (!question.isReleased && !req.user?.isAdmin) {
      if (question.scheduledRelease && new Date(question.scheduledRelease) > new Date()) {
        return res.status(403).json({ 
          error: 'Question not released yet',
          scheduledRelease: question.scheduledRelease 
        });
      }
      return res.status(403).json({ error: 'Question is locked' });
    }
    
    // Check if user has access (for premium content)
    if (question.isPremium && !req.user?.hasPremiumAccess) {
      return res.status(402).json({ error: 'Premium content requires payment' });
    }
    
    // Increment view count
    question.views += 1;
    await question.save();
    
    // Get previous and next questions
    const [prevQuestion, nextQuestion] = await Promise.all([
      Question.findOne({
        subtopicId: question.subtopicId,
        order: { $lt: question.order },
        isReleased: true
      }).sort({ order: -1 }).select('_id'),
      
      Question.findOne({
        subtopicId: question.subtopicId,
        order: { $gt: question.order },
        isReleased: true
      }).sort({ order: 1 }).select('_id')
    ]);
    
    // Prepare response
    const response = {
      id: question._id,
      questionHindi: question.questionHindi,
      questionEnglish: question.questionEnglish,
      answerHindi: question.answerHindi,
      answerEnglish: question.answerEnglish,
      difficulty: question.difficulty,
      estimatedTime: question.estimatedTime,
      keywords: question.keywords,
      caseLaws: question.caseLaws,
      scheduledRelease: question.scheduledRelease,
      isPremium: question.isPremium,
      
      // Navigation info
      examId: question.subtopicId?.topicId?.unitId?.examId,
      unitId: question.subtopicId?.topicId?.unitId?._id,
      topicId: question.subtopicId?.topicId?._id,
      subtopicId: question.subtopicId?._id,
      
      // Subtopic info
      subtopicName: question.subtopicId?.name,
      subtopicNameHindi: question.subtopicId?.nameHindi,
      topicName: question.subtopicId?.topicId?.name,
      topicNameHindi: question.subtopicId?.topicId?.nameHindi,
      unitName: question.subtopicId?.topicId?.unitId?.name,
      unitNameHindi: question.subtopicId?.topicId?.unitId?.nameHindi,
      
      // Navigation
      prevQuestionId: prevQuestion?._id,
      nextQuestionId: nextQuestion?._id,
      
      // User progress
      isCompleted: false,
      timeSpent: 0
    };
    
    // Add user progress if logged in
    if (userId) {
      const progress = await Progress.findOne({ userId });
      if (progress) {
        const completed = progress.completedQuestions.find(q => 
          q.questionId.toString() === questionId
        );
        
        if (completed) {
          response.isCompleted = true;
          response.timeSpent = completed.timeSpent;
        }
      }
    }
    
    res.json(response);
  } catch (error) {
    console.error('Error fetching question:', error);
    res.status(500).json({ error: 'Failed to fetch question' });
  }
};

// Save progress for a question
export const saveProgress = async (req, res) => {
  try {
    const { questionId } = req.params;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    const { completed, timeSpent, lastPosition } = req.body;
    
    // Find or create progress document
    let progress = await Progress.findOne({ userId });
    
    if (!progress) {
      progress = new Progress({ userId });
    }
    
    // Update last active
    progress.lastActive = new Date();
    
    // Update streak
    const lastActiveDate = new Date(progress.lastActive);
    const today = new Date();
    const diffDays = Math.floor((today - lastActiveDate) / (1000 * 60 * 60 * 24));
    
    if (diffDays === 1) {
      progress.streak += 1;
    } else if (diffDays > 1) {
      progress.streak = 1;
    }
    
    // Update completed questions
    if (completed) {
      const existingIndex = progress.completedQuestions.findIndex(q => 
        q.questionId.toString() === questionId
      );
      
      if (existingIndex >= 0) {
        progress.completedQuestions[existingIndex] = {
          questionId,
          completedAt: new Date(),
          timeSpent: timeSpent || 0,
          accuracy: req.body.accuracy || 100
        };
      } else {
        progress.completedQuestions.push({
          questionId,
          completedAt: new Date(),
          timeSpent: timeSpent || 0,
          accuracy: req.body.accuracy || 100
        });
      }
      
      // Update total time spent
      if (timeSpent) {
        progress.totalTimeSpent += timeSpent;
      }
    }
    
    // Update current question
    progress.currentQuestion = questionId;
    
    await progress.save();
    
    res.json({ success: true, streak: progress.streak });
  } catch (error) {
    console.error('Error saving progress:', error);
    res.status(500).json({ error: 'Failed to save progress' });
  }
};

// Get user progress
export const getUserProgress = async (req, res) => {
  try {
    const userId = req.user?.id;
    
    if (!userId) {
      return res.json({
        completedQuestions: [],
        streak: 0,
        totalTimeSpent: 0,
        recentActivity: []
      });
    }
    
    const progress = await Progress.findOne({ userId })
      .populate('completedQuestions.questionId', 'subtopicId order questionHindi questionEnglish');
    
    if (!progress) {
      return res.json({
        completedQuestions: [],
        streak: 0,
        totalTimeSpent: 0,
        recentActivity: []
      });
    }
    
    // Format recent activity
    const recentActivity = progress.completedQuestions
      .slice(-5)
      .reverse()
      .map(item => ({
        action: `Completed question`,
        question: item.questionId?.questionHindi?.substring(0, 50) + '...',
        time: item.completedAt.toLocaleDateString()
      }));
    
    res.json({
      completedQuestions: progress.completedQuestions.map(q => q.questionId._id),
      streak: progress.streak,
      totalTimeSpent: progress.totalTimeSpent,
      recentActivity,
      lastActive: progress.lastActive
    });
  } catch (error) {
    console.error('Error fetching user progress:', error);
    res.status(500).json({ error: 'Failed to fetch progress' });
  }
};
