const Question = require('../models/Question');
const Progress = require('../models/Progress');

// Middleware to validate syllabus navigation
const validateSyllabusNavigation = async (req, res, next) => {
  try {
    // Skip validation for admin
    if (req.user?.isAdmin) {
      return next();
    }
    
    const { questionId } = req.params;
    
    // If accessing a question directly
    if (questionId && !req.query.subtopicId) {
      // Check if user has permission to access this question directly
      const question = await Question.findById(questionId);
      
      if (!question) {
        return res.status(404).json({ error: 'Question not found' });
      }
      
      // Redirect to syllabus tree
      return res.status(302).json({
        redirect: true,
        redirectTo: `/qna/syllabus/${question.examId}?forceNavigation=true`,
        message: 'Please navigate through syllabus tree'
      });
    }
    
    // Validate the navigation path is complete
    if (req.query.questionId) {
      const { examId, unitId, topicId, subtopicId } = req.query;
      
      if (!examId || !unitId || !topicId || !subtopicId) {
        return res.status(400).json({
          error: 'Incomplete navigation path',
          message: 'Please provide examId, unitId, topicId, and subtopicId'
        });
      }
      
      // Verify the path is valid
      const question = await Question.findById(req.query.questionId);
      
      if (!question) {
        return res.status(404).json({ error: 'Question not found' });
      }
      
      // Here you would verify that the question belongs to the provided path
      // This requires additional queries to check the hierarchy
    }
    
    next();
  } catch (error) {
    console.error('Error validating syllabus navigation:', error);
    res.status(500).json({ error: 'Navigation validation failed' });
  }
};

// Middleware to check content access
const checkContentAccess = async (req, res, next) => {
  try {
    const { questionId } = req.params;
    
    if (!questionId) {
      return next();
    }
    
    const question = await Question.findById(questionId);
    
    if (!question) {
      return res.status(404).json({ error: 'Question not found' });
    }
    
    // Check if content is locked
    if (question.isLocked && !req.user?.isAdmin) {
      return res.status(403).json({ error: 'Content is locked' });
    }
    
    // Check if content is premium
    if (question.isPremium && !req.user?.hasPremiumAccess) {
      return res.status(402).json({ 
        error: 'Premium content requires subscription',
        redirectTo: '/payment'
      });
    }
    
    // Check scheduled release
    if (question.scheduledRelease && 
        new Date(question.scheduledRelease) > new Date() && 
        !req.user?.isAdmin) {
      return res.status(403).json({
        error: 'Content not released yet',
        scheduledRelease: question.scheduledRelease
      });
    }
    
    next();
  } catch (error) {
    console.error('Error checking content access:', error);
    res.status(500).json({ error: 'Access check failed' });
  }
};

// Middleware to check progress tracking
const trackProgress = async (req, res, next) => {
  try {
    const { questionId } = req.params;
    const userId = req.user?.id;
    
    if (!userId || !questionId) {
      return next();
    }
    
    // Record view (non-blocking)
    setTimeout(async () => {
      try {
        await Question.findByIdAndUpdate(questionId, {
          $inc: { views: 1 }
        });
      } catch (error) {
        console.error('Error tracking view:', error);
      }
    }, 0);
    
    next();
  } catch (error) {
    console.error('Error in progress tracking middleware:', error);
    next(); // Don't block request on tracking errors
  }
};

// Middleware to prevent direct URL access
const preventDirectAccess = (req, res, next) => {
  // Check if request is coming from within the app
  const referer = req.headers.referer;
  const isDirectAccess = !referer || !referer.includes('/qna/syllabus');
  
  if (isDirectAccess && req.path.includes('/question/') && !req.user?.isAdmin) {
    // Redirect to syllabus tree
    return res.redirect('/qna/exams');
  }
  
  next();
};

module.exports = {
  validateSyllabusNavigation,
  checkContentAccess,
  trackProgress,
  preventDirectAccess
};
