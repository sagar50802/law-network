const Exam = require('../models/Exam');
const Unit = require('../models/Unit');
const Topic = require('../models/Topic');
const Subtopic = require('../models/Subtopic');
const Question = require('../models/Question');

class AdminController {
  // Create new exam
  async createExam(req, res) {
    try {
      const { name, nameHindi, description, icon } = req.body;
      
      const exam = new Exam({
        name,
        nameHindi,
        description,
        icon: icon || '⚖️'
      });
      
      await exam.save();
      
      res.json({ success: true, exam });
    } catch (error) {
      console.error('Error creating exam:', error);
      res.status(500).json({ error: 'Failed to create exam' });
    }
  }

  // Create syllabus structure
  async createSyllabusNode(req, res) {
    try {
      const { type, parentId, ...data } = req.body;
      
      let node;
      
      switch (type) {
        case 'unit':
          node = new Unit({
            examId: parentId,
            ...data
          });
          break;
          
        case 'topic':
          node = new Topic({
            unitId: parentId,
            ...data
          });
          break;
          
        case 'subtopic':
          node = new Subtopic({
            topicId: parentId,
            ...data
          });
          break;
          
        default:
          return res.status(400).json({ error: 'Invalid node type' });
      }
      
      await node.save();
      
      // Update parent counts
      await this.updateParentCounts(type, parentId);
      
      res.json({ success: true, node });
    } catch (error) {
      console.error('Error creating syllabus node:', error);
      res.status(500).json({ error: 'Failed to create syllabus node' });
    }
  }

  // Create bilingual question
  async createQuestion(req, res) {
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
        isPremium
      } = req.body;
      
      // Get exam and topic info
      const subtopic = await Subtopic.findById(subtopicId)
        .populate('topicId', 'unitId')
        .populate('topicId.unitId', 'examId');
      
      if (!subtopic) {
        return res.status(404).json({ error: 'Subtopic not found' });
      }
      
      // Get next order number
      const lastQuestion = await Question.findOne({ subtopicId })
        .sort({ order: -1 });
      const order = lastQuestion ? lastQuestion.order + 1 : 1;
      
      const question = new Question({
        subtopicId,
        examId: subtopic.topicId.unitId.examId,
        order,
        questionHindi,
        questionEnglish,
        answerHindi,
        answerEnglish,
        difficulty: difficulty || 'medium',
        keywords: keywords || [],
        caseLaws: caseLaws || [],
        scheduledRelease: scheduledRelease ? new Date(scheduledRelease) : null,
        isReleased: !scheduledRelease,
        isPremium: isPremium || false
      });
      
      await question.save();
      
      // Update subtopic question count
      await Subtopic.findByIdAndUpdate(subtopicId, {
        $inc: { totalQuestions: 1 }
      });
      
      // Update topic and unit counts
      await this.updateParentQuestionCounts(subtopic.topicId._id, subtopic.topicId.unitId._id);
      
      res.json({ success: true, question });
    } catch (error) {
      console.error('Error creating question:', error);
      res.status(500).json({ error: 'Failed to create question' });
    }
  }

  // Schedule question release
  async scheduleQuestion(req, res) {
    try {
      const { questionId } = req.params;
      const { scheduledRelease } = req.body;
      
      const question = await Question.findByIdAndUpdate(
        questionId,
        {
          scheduledRelease: new Date(scheduledRelease),
          isReleased: false
        },
        { new: true }
      );
      
      // Add to scheduler queue
      await this.addToScheduler(questionId, scheduledRelease);
      
      res.json({ success: true, question });
    } catch (error) {
      console.error('Error scheduling question:', error);
      res.status(500).json({ error: 'Failed to schedule question' });
    }
  }

  // Get scheduled questions
  async getScheduledQuestions(req, res) {
    try {
      const scheduledQuestions = await Question.find({
        scheduledRelease: { $ne: null },
        isReleased: false
      })
        .populate('subtopicId', 'name')
        .populate('subtopicId.topicId', 'name')
        .populate('subtopicId.topicId.unitId', 'name')
        .sort('scheduledRelease')
        .lean();
      
      res.json(scheduledQuestions);
    } catch (error) {
      console.error('Error fetching scheduled questions:', error);
      res.status(500).json({ error: 'Failed to fetch scheduled questions' });
    }
  }

  // Get analytics
  async getAnalytics(req, res) {
    try {
      const [
        totalExams,
        totalUnits,
        totalTopics,
        totalSubtopics,
        totalQuestions,
        releasedQuestions,
        premiumQuestions,
        totalViews,
        totalCompletions,
        averageTimeSpent
      ] = await Promise.all([
        Exam.countDocuments(),
        Unit.countDocuments(),
        Topic.countDocuments(),
        Subtopic.countDocuments(),
        Question.countDocuments(),
        Question.countDocuments({ isReleased: true }),
        Question.countDocuments({ isPremium: true }),
        Question.aggregate([{ $group: { _id: null, total: { $sum: '$views' } } }]),
        Question.aggregate([{ $group: { _id: null, total: { $sum: '$completionCount' } } }]),
        Question.aggregate([{ $group: { _id: null, avg: { $avg: '$averageTimeSpent' } } }])
      ]);
      
      // Get recent activity
      const recentQuestions = await Question.find()
        .sort({ createdAt: -1 })
        .limit(10)
        .populate('subtopicId', 'name')
        .lean();
      
      // Get popular questions
      const popularQuestions = await Question.find()
        .sort({ views: -1 })
        .limit(10)
        .populate('subtopicId', 'name')
        .lean();
      
      res.json({
        counts: {
          exams: totalExams,
          units: totalUnits,
          topics: totalTopics,
          subtopics: totalSubtopics,
          questions: totalQuestions,
          releasedQuestions,
          premiumQuestions
        },
        engagement: {
          totalViews: totalViews[0]?.total || 0,
          totalCompletions: totalCompletions[0]?.total || 0,
          averageTimeSpent: averageTimeSpent[0]?.avg || 0
        },
        recentQuestions,
        popularQuestions
      });
    } catch (error) {
      console.error('Error fetching analytics:', error);
      res.status(500).json({ error: 'Failed to fetch analytics' });
    }
  }

  // Helper: Update parent counts
  async updateParentCounts(type, parentId) {
    try {
      if (type === 'subtopic') {
        // Update topic subtopic count
        await Topic.findByIdAndUpdate(parentId, {
          $inc: { totalSubtopics: 1 }
        });
      }
    } catch (error) {
      console.error('Error updating parent counts:', error);
    }
  }

  // Helper: Update parent question counts
  async updateParentQuestionCounts(topicId, unitId) {
    try {
      // Update topic question count
      const topicQuestionCount = await Question.countDocuments({
        subtopicId: { $in: await this.getSubtopicIds(topicId) }
      });
      
      await Topic.findByIdAndUpdate(topicId, {
        totalQuestions: topicQuestionCount
      });
      
      // Update unit question count
      const unitQuestionCount = await Question.countDocuments({
        examId: { $in: await this.getTopicIds(unitId).then(topicIds => 
          this.getSubtopicIds(topicIds).then(subtopicIds => 
            Question.find({ subtopicId: { $in: subtopicIds } }).countDocuments()
          )
        )}
      });
      
      await Unit.findByIdAndUpdate(unitId, {
        totalQuestions: unitQuestionCount
      });
    } catch (error) {
      console.error('Error updating parent question counts:', error);
    }
  }

  // Helper: Get subtopic IDs for a topic
  async getSubtopicIds(topicId) {
    const subtopics = await Subtopic.find({ topicId }).select('_id');
    return subtopics.map(s => s._id);
  }

  // Helper: Get topic IDs for a unit
  async getTopicIds(unitId) {
    const topics = await Topic.find({ unitId }).select('_id');
    return topics.map(t => t._id);
  }

  // Helper: Add to scheduler
  async addToScheduler(questionId, releaseTime) {
    // This would integrate with your scheduler service
    // For example, using node-schedule or a message queue
    console.log(`Scheduling question ${questionId} for release at ${releaseTime}`);
    
    // In a real implementation, you might:
    // 1. Add to Redis queue
    // 2. Schedule with node-schedule
    // 3. Send to a message queue for processing
  }
}

module.exports = new AdminController();
