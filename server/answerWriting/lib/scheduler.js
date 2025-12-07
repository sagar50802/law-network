// server/answerWriting/lib/scheduler.js
import cron from "node-cron";
import Question from "../models/Question.js";

cron.schedule("* * * * *", async () => {
  try {
    const now = new Date();

    const pending = await Question.find({
      releaseAt: { $lte: now },
      isReleased: false,
    });

    if (pending.length > 0) {
      for (const q of pending) {
        q.isReleased = true;
        await q.save();
      }

      console.log(`✅ Auto Released ${pending.length} questions at ${now}`);
    }
  } catch (err) {
    console.error("Scheduler error:", err.message);
  }
});
