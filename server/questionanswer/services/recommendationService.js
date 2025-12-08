import Topic from '../models/Topic.js';
import Progress from '../models/Progress.js';

class RecommendationService {
  constructor() {
    this.userModels = new Map(); // Simple in-memory user models
    this.topicGraph = new Map(); // Topic dependency graph
    this.initializeTopicGraph();
  }

  // Initialize topic dependency graph
  async initializeTopicGraph() {
    try {
      const topics = await Topic.find().select('_id dependencies order unitId difficulty');
      
      for (const topic of topics) {
        this.topicGraph.set(topic._id.toString(), {
          id: topic._id,
          dependencies: topic.dependencies.map(d => d.toString()),
          order: topic.order,
          unitId: topic.unitId,
          difficulty: topic.difficulty
        });
      }
      
      console.log(`✅ Initialized topic graph with ${topics.length} topics`);
    } catch (error) {
      console.error('❌ Error initializing topic graph:', error.message);
    }
  }

  // Get personalized recommendations for user
  async getPersonalizedRecommendations(userId, currentTopicId = null) {
    try {
      // Get user progress
      const progress = await Progress.findOne({ userId });
      
      if (!progress) {
        return this.getDefaultRecommendations(currentTopicId);
      }
      
      // Get completed topics
      const completedTopics = await this.getCompletedTopics(userId);
      
      // Get user learning patterns
      const userPatterns = await this.analyzeUserPatterns(userId, progress);
      
      // Generate recommendations based on multiple factors
      const recommendations = [];
      
      // Factor 1: Syllabus order
      const syllabusRecs = await this.getSyllabusBasedRecommendations(
        currentTopicId, 
        completedTopics
      );
      recommendations.push(...syllabusRecs);
      
      // Factor 2: Dependency fulfillment
      const dependencyRecs = await this.getDependencyBasedRecommendations(
        completedTopics
      );
      recommendations.push(...dependencyRecs);
      
      // Factor 3: Difficulty progression
      const difficultyRecs = await this.getDifficultyBasedRecommendations(
        userPatterns.difficultyLevel,
        completedTopics
      );
      recommendations.push(...difficultyRecs);
      
      // Factor 4: Time-based recommendations
      const timeRecs = this.getTimeBasedRecommendations(userPatterns);
      recommendations.push(...timeRecs);
      
      // Combine and score recommendations
      const scoredRecommendations = this.scoreRecommendations(
        recommendations,
        userPatterns,
        completedTopics
      );
      
      // Return top 5 recommendations
      return scoredRecommendations.slice(0, 5);
    } catch (error) {
      console.error('❌ Error generating personalized recommendations:', error.message);
      return this.getDefaultRecommendations(currentTopicId);
    }
  }

  // Get default recommendations (for new users)
  async getDefaultRecommendations(currentTopicId) {
    try {
      if (currentTopicId) {
        // Get next topics in syllabus
        const currentTopic = await Topic.findById(currentTopicId);
        
        if (currentTopic) {
          const nextTopics = await Topic.find({
            unitId: currentTopic.unitId,
            order: { $gt: currentTopic.order },
            isLocked: false
          })
            .sort('order')
            .limit(3)
            .populate('unitId', 'name')
            .lean();
          
          return nextTopics.map(topic => ({
            id: topic._id,
            type: 'topic',
            title: `${topic.unitId.name} - ${topic.name}`,
            description: 'Next in syllabus',
            difficulty: topic.difficulty,
            estimatedTime: topic.estimatedTime,
            reason: 'Syllabus order',
            confidence: 0.8
          }));
        }
      }
      
      // Get easy topics from first unit
      const easyTopics = await Topic.find({ difficulty: 'easy', isLocked: false })
        .limit(3)
        .populate('unitId', 'name')
        .lean();
      
      return easyTopics.map(topic => ({
        id: topic._id,
        type: 'topic',
        title: `${topic.unitId.name} - ${topic.name}`,
        description: 'Good starting point',
        difficulty: topic.difficulty,
        estimatedTime: topic.estimatedTime,
        reason: 'Beginner friendly',
        confidence: 0.7
      }));
    } catch (error) {
      console.error('❌ Error getting default recommendations:', error.message);
      return [];
    }
  }

  // Get completed topics for user
  async getCompletedTopics(userId) {
    try {
      const progress = await Progress.findOne({ userId })
        .populate({
          path: 'completedQuestions.questionId',
          populate: {
            path: 'subtopicId',
            populate: {
              path: 'topicId'
            }
          }
        });
      
      if (!progress) return new Set();
      
      const completedTopicIds = new Set();
      
      for (const completed of progress.completedQuestions) {
        if (completed.questionId?.subtopicId?.topicId) {
          completedTopicIds.add(completed.questionId.subtopicId.topicId._id.toString());
        }
      }
      
      return completedTopicIds;
    } catch (error) {
      console.error('❌ Error getting completed topics:', error.message);
      return new Set();
    }
  }

  // Analyze user learning patterns
  async analyzeUserPatterns(userId, progress) {
    try {
      const patterns = {
        difficultyLevel: 'medium',
        preferredStudyTime: 'any',
        completionRate: 0,
        averageTimePerQuestion: 0,
        preferredTopics: [],
        weakAreas: []
      };
      
      if (!progress || progress.completedQuestions.length === 0) {
        return patterns;
      }
      
      // Calculate average difficulty
      const difficulties = await this.getCompletedDifficulties(userId);
      patterns.difficultyLevel = this.calculateAverageDifficulty(difficulties);
      
      // Calculate completion rate
      const totalAttempted = progress.completedQuestions.length;
      // Assuming all attempted are completed for now
      patterns.completionRate = 100;
      
      // Calculate average time per question
      if (progress.totalTimeSpent > 0) {
        patterns.averageTimePerQuestion = Math.round(
          progress.totalTimeSpent / totalAttempted / 60
        ); // Convert to minutes
      }
      
      // Get preferred topics (most completed)
      patterns.preferredTopics = await this.getPreferredTopics(userId);
      
      // Get weak areas (topics with low completion or accuracy)
      patterns.weakAreas = await this.getWeakAreas(userId);
      
      return patterns;
    } catch (error) {
      console.error('❌ Error analyzing user patterns:', error.message);
      return {
        difficultyLevel: 'medium',
        preferredStudyTime: 'any',
        completionRate: 0,
        averageTimePerQuestion: 0,
        preferredTopics: [],
        weakAreas: []
      };
    }
  }

  // Get syllabus-based recommendations
  async getSyllabusBasedRecommendations(currentTopicId, completedTopics) {
    try {
      if (!currentTopicId) return [];
      
      const currentTopic = await Topic.findById(currentTopicId);
      
      if (!currentTopic) return [];
      
      // Get next topics in syllabus that aren't completed
      const nextTopics = await Topic.find({
        unitId: currentTopic.unitId,
        order: { $gt: currentTopic.order },
        _id: { $nin: Array.from(completedTopics) },
        isLocked: false
      })
        .sort('order')
        .limit(5)
        .lean();
      
      return nextTopics.map(topic => ({
        id: topic._id,
        type: 'topic',
        reason: 'Next in syllabus',
        confidence: 0.9
      }));
    } catch (error) {
      console.error('❌ Error getting syllabus recommendations:', error.message);
      return [];
    }
  }

  // Get dependency-based recommendations
  async getDependencyBasedRecommendations(completedTopics) {
    try {
      const recommendations = [];
      
      // Check all topics to see if their dependencies are satisfied
      for (const [topicId, topicData] of this.topicGraph.entries()) {
        if (completedTopics.has(topicId)) continue;
        
        const dependencies = topicData.dependencies || [];
        const satisfiedDependencies = dependencies.filter(dep => 
          completedTopics.has(dep)
        );
        
        // If all dependencies are satisfied
        if (dependencies.length > 0 && satisfiedDependencies.length === dependencies.length) {
          recommendations.push({
            id: topicId,
            type: 'topic',
            reason: 'All prerequisites completed',
            confidence: 1.0
          });
        }
      }
      
      return recommendations;
    } catch (error) {
      console.error('❌ Error getting dependency recommendations:', error.message);
      return [];
    }
  }

  // Get difficulty-based recommendations
  async getDifficultyBasedRecommendations(userDifficultyLevel, completedTopics) {
    try {
      // Get topics at appropriate difficulty level
      const difficultyMap = {
        'easy': ['easy'],
        'medium': ['easy', 'medium'],
        'hard': ['easy', 'medium', 'hard']
      };
      
      const appropriateDifficulties = difficultyMap[userDifficultyLevel] || ['medium'];
      
      const topics = await Topic.find({
        difficulty: { $in: appropriateDifficulties },
        _id: { $nin: Array.from(completedTopics) },
        isLocked: false
      })
        .limit(10)
        .lean();
      
      return topics.map(topic => ({
        id: topic._id,
        type: 'topic',
        reason: `Appropriate difficulty (${topic.difficulty})`,
        confidence: 0.7
      }));
    } catch (error) {
      console.error('❌ Error getting difficulty recommendations:', error.message);
      return [];
    }
  }

  // Get time-based recommendations
  getTimeBasedRecommendations(userPatterns) {
    // This would consider:
    // - Time of day user studies
    // - Study session length
    // - Recent activity
    // For now, return empty array
    return [];
  }

  // Score recommendations
  scoreRecommendations(recommendations, userPatterns, completedTopics) {
    const scored = [];
    
    for (const rec of recommendations) {
      let score = 0;
      
      // Base score from confidence
      score += rec.confidence * 40;
      
      // Boost for dependency fulfillment
      if (rec.reason.includes('prerequisites')) {
        score += 30;
      }
      
      // Boost for syllabus order
      if (rec.reason.includes('syllabus')) {
        score += 20;
      }
      
      // Penalize for being too difficult
      if (rec.difficulty === 'hard' && userPatterns.difficultyLevel === 'easy') {
        score -= 20;
      }
      
      // Add random variation
      score += (Math.random() * 10 - 5);
      
      scored.push({
        ...rec,
        score: Math.min(100, Math.max(0, score))
      });
    }
    
    // Sort by score
    scored.sort((a, b) => b.score - a.score);
    
    // Remove duplicates
    const uniqueScored = [];
    const seenIds = new Set();
    
    for (const rec of scored) {
      if (!seenIds.has(rec.id)) {
        seenIds.add(rec.id);
        uniqueScored.push(rec);
      }
    }
    
    return uniqueScored;
  }

  // Helper: Get completed difficulties
  async getCompletedDifficulties(userId) {
    try {
      const progress = await Progress.findOne({ userId })
        .populate('completedQuestions.questionId');
      
      if (!progress) return [];
      
      const difficulties = [];
      
      for (const completed of progress.completedQuestions) {
        if (completed.questionId?.difficulty) {
          difficulties.push(completed.questionId.difficulty);
        }
      }
      
      return difficulties;
    } catch (error) {
      console.error('❌ Error getting completed difficulties:', error.message);
      return [];
    }
  }

  // Helper: Calculate average difficulty
  calculateAverageDifficulty(difficulties) {
    if (difficulties.length === 0) return 'medium';
    
    const difficultyScores = {
      'easy': 1,
      'medium': 2,
      'hard': 3
    };
    
    const totalScore = difficulties.reduce((sum, diff) => {
      return sum + (difficultyScores[diff] || 2);
    }, 0);
    
    const averageScore = totalScore / difficulties.length;
    
    if (averageScore < 1.5) return 'easy';
    if (averageScore < 2.5) return 'medium';
    return 'hard';
  }

  // Helper: Get preferred topics
  async getPreferredTopics(userId) {
    // Implementation would track which topics user completes quickly/accurately
    return [];
  }

  // Helper: Get weak areas
  async getWeakAreas(userId) {
    // Implementation would track which topics user struggles with
    return [];
  }

  // Update user model based on interaction
  async recordUserInteraction(userId, interaction) {
    try {
      const { type, topicId, questionId, action, timeSpent, accuracy } = interaction;
      
      // Update user model with this interaction
      if (!this.userModels.has(userId)) {
        this.userModels.set(userId, {
          interactions: [],
          topicPreferences: new Map(),
          difficultyProgression: []
        });
      }
      
      const userModel = this.userModels.get(userId);
      userModel.interactions.push({
        timestamp: new Date(),
        type,
        topicId,
        questionId,
        action,
        timeSpent,
        accuracy
      });
      
      // Keep only last 100 interactions
      if (userModel.interactions.length > 100) {
        userModel.interactions = userModel.interactions.slice(-100);
      }
      
      // Update topic preference
      if (topicId) {
        const currentCount = userModel.topicPreferences.get(topicId) || 0;
        userModel.topicPreferences.set(topicId, currentCount + 1);
      }
      
      console.log(`✅ Recorded interaction for user ${userId}: ${action} on ${type}`);
    } catch (error) {
      console.error('❌ Error recording user interaction:', error.message);
    }
  }
}

// Create singleton instance
const recommendationService = new RecommendationService();

// Export for ES modules
export default recommendationService;

// Named exports for initialization
export const initializeTopicGraph = async () => {
  await recommendationService.initializeTopicGraph();
  return recommendationService;
};
