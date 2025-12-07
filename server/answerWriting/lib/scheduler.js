import Question from "../models/Question.js";

const INTERVAL_MS = 60 * 1000; // every 1 minute

async function releaseDueQuestions() {
  const now = new Date();
  try {
    const res = await Question.updateMany(
      { isReleased: false, releaseAt: { $lte: now } },
      { $set: { isReleased: true } }
    );

    if (res.modifiedCount) {
      console.log(
        `[AnswerWriting] Released ${res.modifiedCount} questions at ${now.toISOString()}`
      );
    }
  } catch (err) {
    console.error("[AnswerWriting] Scheduler error:", err.message);
  }
}

// run once on startup + every minute
releaseDueQuestions();
setInterval(releaseDueQuestions, INTERVAL_MS);
