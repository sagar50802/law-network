import Question from "../models/Question.js";
import Progress from "../models/Progress.js";

/* -------------------------------------------------------------------------- */
/* 📌 Validate Syllabus Navigation                                            */
/* -------------------------------------------------------------------------- */
export const validateSyllabusNavigation = async (req, res, next) => {
  try {
    // Skip validation for admin
    if (req.user?.isAdmin) return next();

    const { questionId } = req.params;

    // If accessing a question directly
    if (questionId && !req.query.subtopicId) {
      const question = await Question.findById(questionId);

      if (!question) {
        return res.status(404).json({ error: "Question not found" });
      }

      return res.status(302).json({
        redirect: true,
        redirectTo: `/qna/syllabus/${question.examId}?forceNavigation=true`,
        message: "Please navigate through syllabus tree",
      });
    }

    // Validate path completeness
    if (req.query.questionId) {
      const { examId, unitId, topicId, subtopicId } = req.query;

      if (!examId || !unitId || !topicId || !subtopicId) {
        return res.status(400).json({
          error: "Incomplete navigation path",
          message: "Please provide examId, unitId, topicId, and subtopicId",
        });
      }

      const question = await Question.findById(req.query.questionId);
      if (!question) {
        return res.status(404).json({ error: "Question not found" });
      }
    }

    next();
  } catch (error) {
    console.error("Error validating syllabus navigation:", error);
    res.status(500).json({ error: "Navigation validation failed" });
  }
};

/* -------------------------------------------------------------------------- */
/* 📌 Check Content Access                                                    */
/* -------------------------------------------------------------------------- */
export const checkContentAccess = async (req, res, next) => {
  try {
    const { questionId } = req.params;

    if (!questionId) return next();

    const question = await Question.findById(questionId);
    if (!question) {
      return res.status(404).json({ error: "Question not found" });
    }

    if (question.isLocked && !req.user?.isAdmin) {
      return res.status(403).json({ error: "Content is locked" });
    }

    if (question.isPremium && !req.user?.hasPremiumAccess) {
      return res.status(402).json({
        error: "Premium content requires subscription",
        redirectTo: "/payment",
      });
    }

    if (
      question.scheduledRelease &&
      new Date(question.scheduledRelease) > new Date() &&
      !req.user?.isAdmin
    ) {
      return res.status(403).json({
        error: "Content not released yet",
        scheduledRelease: question.scheduledRelease,
      });
    }

    next();
  } catch (error) {
    console.error("Error checking content access:", error);
    res.status(500).json({ error: "Access check failed" });
  }
};

/* -------------------------------------------------------------------------- */
/* 📌 Track Progress (Views)                                                  */
/* -------------------------------------------------------------------------- */
export const trackProgress = async (req, res, next) => {
  try {
    const { questionId } = req.params;
    const userId = req.user?.id;

    if (!userId || !questionId) return next();

    setTimeout(async () => {
      try {
        await Question.findByIdAndUpdate(questionId, {
          $inc: { views: 1 },
        });
      } catch (err) {
        console.error("Error tracking view:", err);
      }
    }, 0);

    next();
  } catch (error) {
    console.error("Error in progress tracking middleware:", error);
    next();
  }
};

/* -------------------------------------------------------------------------- */
/* 📌 Prevent Direct URL Access                                               */
/* -------------------------------------------------------------------------- */
export const preventDirectAccess = (req, res, next) => {
  const referer = req.headers.referer;
  const isDirectAccess =
    !referer || !referer.includes("/qna/syllabus");

  if (
    isDirectAccess &&
    req.path.includes("/question/") &&
    !req.user?.isAdmin
  ) {
    return res.redirect("/qna/exams");
  }

  next();
};
