const Exam = require("../models/Exam");
const Unit = require("../models/Unit");

function toCode(name = "") {
  return String(name).trim().toLowerCase().replace(/\s+/g, "-");
}

exports.createExam = async (req, res) => {
  try {
    const { name, code } = req.body;
    if (!name) return res.status(400).json({ message: "Name is required" });

    const finalCode = code || toCode(name);

    const exam = await Exam.create({ name, code: finalCode });
    res.status(201).json(exam);
  } catch (err) {
    console.error("createExam error", err);
    res.status(500).json({ message: "Failed to create exam" });
  }
};

exports.getAllExams = async (req, res) => {
  try {
    const exams = await Exam.find().sort("createdAt").lean();

    const unitCounts = await Unit.aggregate([
      { $group: { _id: "$examId", count: { $sum: 1 } } },
    ]);

    const countMap = {};
    unitCounts.forEach((u) => {
      countMap[String(u._id)] = u.count;
    });

    const result = exams.map((e) => ({
      id: e.code, // important: frontend uses this in URL
      name: e.name,
      unitCount: countMap[String(e._id)] || 0,
    }));

    res.json(result);
  } catch (err) {
    console.error("getAllExams error", err);
    res.status(500).json({ message: "Failed to fetch exams" });
  }
};

async function findExamByParam(examId) {
  if (!examId) return null;
  // try code first (bihar-apo etc)
  let exam = await Exam.findOne({ code: examId });
  if (exam) return exam;
  // fallback: treat as Mongo _id
  if (examId.match(/^[0-9a-fA-F]{24}$/)) {
    exam = await Exam.findById(examId);
  }
  return exam;
}

exports.getExamDetail = async (req, res) => {
  try {
    const { examId } = req.params;
    const exam = await findExamByParam(examId);
    if (!exam) return res.status(404).json({ message: "Exam not found" });
    res.json(exam);
  } catch (err) {
    console.error("getExamDetail error", err);
    res.status(500).json({ message: "Failed to fetch exam detail" });
  }
};

// Export helper for other controllers
exports.findExamByParam = findExamByParam;
