 import Topic from "../models/Topic.js";
import Subtopic from "../models/Subtopic.js";
import Question from "../models/Question.js";
import Progress from "../models/Progress.js";
// Get recommendations based on current topic
export const getRecommendations = async (req, res) => {
  try {
    const { currentTopicId, completedSubtopicId } = req.query;
    const userId = req.user?.id;
    
    let recommendations = [];
    
    // Rule 1: Get dependent topics (topics that depend on completed subtopic)
    if (completedSubtopicId) {
      const dependentTopics = await getDependentTopics(completedSubtopicId);
      recommendations.push(...dependentTopics.map(topic => ({
        ...topic,
        type: 'topic',
        priority: 1,
        reason: 'Dependency requirement'
      })));
    }
    
    // Rule 2: Get next topics in syllabus order
    if (currentTopicId) {
      const nextTopics = await getNextTopics(currentTopicId);
      recommendations.push(...nextTopics.map(topic => ({
        ...topic,
        type: 'topic',
        priority: 2,
        reason: 'Syllabus sequence'
      })));
    }
    
    // Rule 3: Get topics with similar difficulty
    const difficultyTopics = await getSimilarDifficultyTopics(currentTopicId);
    recommendations.push(...difficultyTopics.map(topic => ({
      ...topic,
      type: 'topic',
      priority: 3,
      reason: 'Similar difficulty level'
    })));
    
    // Remove duplicates
    recommendations = removeDuplicates(recommendations);
    
    // Sort by priority
    recommendations.sort((a, b) => a.priority - b.priority);
    
    // Limit to 5 recommendations
    recommendations = recommendations.slice(0, 5);
    
    // Add additional metadata
    recommendations = await enrichRecommendations(recommendations, userId);
    
    res.json(recommendations);
  } catch (error) {
    console.error('Error generating recommendations:', error);
    res.status(500).json({ error: 'Failed to generate recommendations' });
  }
};

// Get topics that depend on completed subtopic
const getDependentTopics = async (completedSubtopicId) => {
  try {
    // Find the subtopic
    const subtopic = await Subtopic.findById(completedSubtopicId)
      .populate('topicId');
    
    if (!subtopic) return [];
    
    // Find topics that have this topic as dependency
    const dependentTopics = await Topic.find({
      dependencies: { $in: [subtopic.topicId._id] },
      isLocked: false
    })
      .select('name nameHindi difficulty estimatedTime totalQuestions')
      .populate('unitId', 'name')
      .lean();
    
    return dependentTopics.map(topic => ({
      id: topic._id,
      title: `${topic.unitId.name} - ${topic.name}`,
      description: `Depends on ${subtopic.topicId.name}`,
      difficulty: topic.difficulty,
      estimatedTime: topic.estimatedTime,
      questionCount: topic.totalQuestions
    }));
  } catch (error) {
    console.error('Error getting dependent topics:', error);
    return [];
  }
};

// Get next topics in syllabus order
const getNextTopics = async (currentTopicId) => {
  try {
    // Get current topic
    const currentTopic = await Topic.findById(currentTopicId)
      .populate('unitId');
    
    if (!currentTopic) return [];
    
    // Find topics in same unit with higher order
    const nextTopics = await Topic.find({
      unitId: currentTopic.unitId,
      order: { $gt: currentTopic.order },
      isLocked: false
    })
      .select('name nameHindi difficulty estimatedTime totalQuestions order')
      .sort('order')
      .limit(3)
      .lean();
    
    return nextTopics.map(topic => ({
      id: topic._id,
      title: topic.name,
      description: `Next topic in ${currentTopic.unitId.name}`,
      difficulty: topic.difficulty,
      estimatedTime: topic.estimatedTime,
      questionCount: topic.totalQuestions,
      order: topic.order
    }));
  } catch (error) {
    console.error('Error getting next topics:', error);
    return [];
  }
};

// Get topics with similar difficulty
const getSimilarDifficultyTopics = async (currentTopicId) => {
  try {
    // Get current topic difficulty
    const currentTopic = await Topic.findById(currentTopicId);
    
    if (!currentTopic) return [];
    
    // Find topics with same difficulty but different unit
    const similarTopics = await Topic.find({
      difficulty: currentTopic.difficulty,
      _id: { $ne: currentTopicId },
      isLocked: false
    })
      .select('name nameHindi difficulty estimatedTime totalQuestions')
      .populate('unitId', 'name')
      .limit(3)
      .lean();
    
    return similarTopics.map(topic => ({
      id: topic._id,
      title: `${topic.unitId.name} - ${topic.name}`,
      description: `Similar difficulty (${topic.difficulty})`,
      difficulty: topic.difficulty,
      estimatedTime: topic.estimatedTime,
      questionCount: topic.totalQuestions
    }));
  } catch (error) {
    console.error('Error getting similar topics:', error);
    return [];
  }
};

// Enrich recommendations with user-specific data
const enrichRecommendations = async (recommendations, userId) => {
  try {
    if (!userId) return recommendations;
    
    // Get user progress
    const progress = await Progress.findOne({ userId });
    
    for (let rec of recommendations) {
      // Check if user has already completed this topic
      if (progress && rec.type === 'topic') {
        const topicQuestions = await Question.find({
          subtopicId: { $in: await getSubtopicIds(rec.id) },
          isReleased: true
        }).select('_id');
        
        const completedCount = progress.completedQuestions.filter(q => 
          topicQuestions.some(tq => tq._id.toString() === q.questionId.toString())
        ).length;
        
        rec.completionRate = topicQuestions.length > 0 
          ? Math.round((completedCount / topicQuestions.length) * 100)
          : 0;
        
        rec.isStarted = completedCount > 0;
      }
      
      // Add estimated time based on question count
      if (rec.questionCount) {
        rec.estimatedTime = Math.max(15, rec.questionCount * 5); // 5 minutes per question
      }
    }
    
    return recommendations;
  } catch (error) {
    console.error('Error enriching recommendations:', error);
    return recommendations;
  }
};

// Helper: Get subtopic IDs for a topic
const getSubtopicIds = async (topicId) => {
  const subtopics = await Subtopic.find({ topicId }).select('_id');
  return subtopics.map(s => s._id);
};

// Helper: Remove duplicate recommendations
const removeDuplicates = (recommendations) => {
  const seen = new Set();
  return recommendations.filter(rec => {
    const key = `${rec.type}-${rec.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

// Update recommendation model based on user action
export const recordUserAction = async (req, res) => {
  try {
    const { action, topicId, questionId } = req.body;
    const userId = req.user?.id;
    
    if (!userId) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Here you would update ML model or scoring system
    // For now, just log the action
    console.log('User action recorded:', { userId, action, topicId, questionId });
    
    // In a real implementation, you might:
    // 1. Update user preference model
    // 2. Adjust difficulty scoring
    // 3. Update collaborative filtering data
    
    res.json({ success: true, message: 'Action recorded' });
  } catch (error) {
    console.error('Error recording user action:', error);
    res.status(500).json({ error: 'Failed to record action' });
  }
};
