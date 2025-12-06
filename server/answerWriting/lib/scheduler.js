const cron = require("node-cron");
const Question = require("../models/Question");

cron.schedule("* * * * *", async () => {
  const now = new Date();

  const dueQuestions = await Question.find({
    isReleased: false,
    releaseAt: { $lte: now },
  });

  for (let q of dueQuestions) {
    q.isReleased = true;
    await q.save();
  }

  if (dueQuestions.length > 0) {
    console.log("Released questions:", dueQuestions.length);
  }
});
