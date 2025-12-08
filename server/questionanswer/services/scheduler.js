const cron = require('node-cron');
const Question = require('../models/Question');

class QuestionScheduler {
  constructor() {
    this.jobs = new Map();
    this.initializeScheduler();
  }

  // Initialize the scheduler
  async initializeScheduler() {
    console.log('Initializing question scheduler...');
    
    // Load pending scheduled questions
    const pendingQuestions = await Question.find({
      scheduledRelease: { $ne: null },
      isReleased: false,
      scheduledRelease: { $gt: new Date() }
    });
    
    // Schedule each question
    for (const question of pendingQuestions) {
      this.scheduleQuestionRelease(question);
    }
    
    // Daily cleanup job
    cron.schedule('0 0 * * *', async () => {
      await this.cleanupReleasedQuestions();
    });
    
    console.log(`Scheduler initialized with ${pendingQuestions.length} pending questions`);
  }

  // Schedule a question for release
  scheduleQuestionRelease(question) {
    const releaseTime = new Date(question.scheduledRelease);
    const now = new Date();
    
    // If release time is in the past, release immediately
    if (releaseTime <= now) {
      this.releaseQuestion(question._id);
      return;
    }
    
    // Calculate cron expression for the specific time
    const minute = releaseTime.getMinutes();
    const hour = releaseTime.getHours();
    const day = releaseTime.getDate();
    const month = releaseTime.getMonth() + 1; // cron months are 1-12
    const dayOfWeek = releaseTime.getDay();
    
    const cronExpression = `${minute} ${hour} ${day} ${month} ${dayOfWeek}`;
    
    try {
      // Schedule the job
      const job = cron.schedule(cronExpression, async () => {
        await this.releaseQuestion(question._id);
        this.jobs.delete(question._id.toString());
      });
      
      // Store the job reference
      this.jobs.set(question._id.toString(), job);
      
      console.log(`Scheduled question ${question._id} for release at ${releaseTime}`);
    } catch (error) {
      console.error(`Error scheduling question ${question._id}:`, error);
    }
  }

  // Release a question
  async releaseQuestion(questionId) {
    try {
      const question = await Question.findByIdAndUpdate(
        questionId,
        {
          isReleased: true,
          scheduledRelease: null
        },
        { new: true }
      );
      
      if (question) {
        console.log(`Question ${questionId} released successfully`);
        
        // Here you could:
        // 1. Send notifications to users
        // 2. Update cache
        // 3. Trigger webhooks
        // 4. Log the release
      }
    } catch (error) {
      console.error(`Error releasing question ${questionId}:`, error);
    }
  }

  // Add new scheduled question
  async addScheduledQuestion(questionId, releaseTime) {
    try {
      const question = await Question.findById(questionId);
      
      if (!question) {
        throw new Error('Question not found');
      }
      
      // If there's an existing job for this question, cancel it
      if (this.jobs.has(questionId)) {
        this.jobs.get(questionId).stop();
        this.jobs.delete(questionId);
      }
      
      // Update the question with new schedule
      question.scheduledRelease = releaseTime;
      question.isReleased = false;
      await question.save();
      
      // Schedule the new release
      this.scheduleQuestionRelease(question);
      
      console.log(`Added scheduled question ${questionId} for ${releaseTime}`);
    } catch (error) {
      console.error(`Error adding scheduled question ${questionId}:`, error);
      throw error;
    }
  }

  // Cancel scheduled question
  async cancelScheduledQuestion(questionId) {
    try {
      if (this.jobs.has(questionId)) {
        this.jobs.get(questionId).stop();
        this.jobs.delete(questionId);
      }
      
      await Question.findByIdAndUpdate(questionId, {
        scheduledRelease: null,
        isReleased: true
      });
      
      console.log(`Cancelled scheduled release for question ${questionId}`);
    } catch (error) {
      console.error(`Error cancelling scheduled question ${questionId}:`, error);
      throw error;
    }
  }

  // Get all scheduled jobs
  getScheduledJobs() {
    const jobs = [];
    
    for (const [questionId, job] of this.jobs.entries()) {
      jobs.push({
        questionId,
        scheduled: true
      });
    }
    
    return jobs;
  }

  // Cleanup released questions
  async cleanupReleasedQuestions() {
    try {
      // Remove scheduledRelease from questions that are already released
      const result = await Question.updateMany(
        {
          isReleased: true,
          scheduledRelease: { $ne: null }
        },
        {
          $set: { scheduledRelease: null }
        }
      );
      
      if (result.modifiedCount > 0) {
        console.log(`Cleaned up ${result.modifiedCount} released questions`);
      }
    } catch (error) {
      console.error('Error cleaning up released questions:', error);
    }
  }

  // Start the scheduler
  start() {
    console.log('Question scheduler started');
  }

  // Stop the scheduler
  stop() {
    for (const job of this.jobs.values()) {
      job.stop();
    }
    this.jobs.clear();
    console.log('Question scheduler stopped');
  }
}

// Create singleton instance
const scheduler = new QuestionScheduler();

module.exports = scheduler;
