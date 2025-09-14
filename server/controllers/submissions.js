// server/controllers/submissions.js

/**
 * Submissions Controller
 * Endpoints:
 *  - POST /api/submissions           -> createSubmission (public)
 *  - GET  /api/submissions           -> listSubmissions (admin-only)
 *  - PATCH /api/submissions/:id      -> updateSubmissionStatus (admin-only)
 *
 * Assumptions:
 *  - Mongoose model at ../models/Submission.js
 *  - File upload (payment screenshot) handled via Multer as `req.file` (field "screenshot")
 *  - Static file serving is configured for "/uploads"
 *  - Owner guard mirrors pattern used elsewhere: req.isOwner OR header "x-owner-key" === process.env.OWNER_KEY
 */

const path = require("path");
const Submission = require("../models/Submission");

// --------------------- utils ---------------------

const pick = (obj, keys) =>
  keys.reduce((acc, k) => {
    if (Object.prototype.hasOwnProperty.call(obj || {}, k)) acc[k] = obj[k];
    return acc;
  }, {});

const trim = (v) => (typeof v === "string" ? v.trim() : v);

const toWebPath = (fsPath = "") => {
  if (!fsPath) return "";
  // Normalize windows backslashes, strip leading "public/"
  const normalized = fsPath.replace(/\\/g, "/").replace(/^public\//i, "");
  // If path already starts with /uploads keep it, else prefix with /
  if (/^\/uploads\//i.test(normalized)) return normalized;
  if (/^uploads\//i.test(normalized)) return `/${normalized}`;
  return `/${normalized.replace(/^\/+/, "")}`;
};

const ensureOwner = (req) => {
  const headerKey = String(req.headers["x-owner-key"] || "");
  const ownerKey = String(process.env.OWNER_KEY || "");
  return Boolean(req.isOwner || (ownerKey && headerKey === ownerKey));
};

const ALLOWED_STATUSES = new Set(["pending", "approved", "revoked"]);

const normalizePlanKey = (k = "") => {
  const key = String(k || "").toLowerCase();
  if (["weekly", "week", "7", "7d"].includes(key)) return "weekly";
  if (["monthly", "month", "30", "30d"].includes(key)) return "monthly";
  if (["yearly", "year", "90", "90d"].includes(key)) return "yearly"; // per project rules (7/30/90)
  return key || "weekly";
};

const planKeyToDays = (planKey) => {
  switch (normalizePlanKey(planKey)) {
    case "weekly":
      return 7;
    case "monthly":
      return 30;
    case "yearly":
      return 90;
    default:
      return 7;
  }
};

// --------------------- controllers ---------------------

// POST /api/submissions
// Creates a viewer submission with required screenshot path.
async function createSubmission(req, res) {
  try {
    const body = pick(req.body || {}, [
      "name",
      "number",
      "gmail",
      "planKey",
      "subject", // e.g., which article/video/pdf/podcast
      "module", // "article" | "podcast" | "video" | "pdf" (optional but recommended)
      "message",
      "price",
    ]);

    const name = trim(body.name || "");
    const number = trim(body.number || "");
    const gmail = trim(body.gmail || "");
    const planKey = normalizePlanKey(body.planKey || "weekly");
    const subject = trim(body.subject || "");
    const moduleKey = trim(body.module || ""); // optional
    const message = trim(body.message || "");
    const price = body.price != null ? Number(body.price) : undefined;

    // Screenshot path can come from Multer (preferred) or from body.screenshotPath if already uploaded elsewhere
    const uploadedFile = req.file || (req.files && req.files.screenshot);
    const screenshotPath =
      uploadedFile?.path || trim(req.body?.screenshotPath || "");

    if (!name || !number || !gmail) {
      return res
        .status(400)
        .json({ ok: false, error: "Name, Number, and Gmail are required." });
    }

    if (!screenshotPath) {
      return res
        .status(400)
        .json({ ok: false, error: "Payment screenshot is required." });
    }

    const webScreenshotUrl = toWebPath(screenshotPath);

    const doc = await Submission.create({
      name,
      number,
      gmail: gmail.toLowerCase(),
      planKey,
      subject,
      module: moduleKey,
      message,
      price: Number.isFinite(price) ? price : undefined,
      screenshotPath, // raw fs path (for server reference)
      screenshotUrl: webScreenshotUrl, // served URL (for client)
      status: "pending",
    });

    return res.status(201).json({ ok: true, data: doc });
  } catch (err) {
    console.error("createSubmission error:", err);
    return res
      .status(500)
      .json({ ok: false, error: "Failed to create submission." });
  }
}

// GET /api/submissions
// Admin-only list with filtering & pagination
async function listSubmissions(req, res) {
  try {
    if (!ensureOwner(req)) {
      return res.status(403).json({ ok: false, error: "Forbidden" });
    }

    const {
      page = "1",
      limit = "20",
      status,
      email,
      module: moduleKey,
      subject,
      q,
      since,
      until,
      sort = "-createdAt",
    } = req.query || {};

    const pageNum = Math.max(parseInt(page, 10) || 1, 1);
    const limitNum = Math.min(Math.max(parseInt(limit, 10) || 20, 1), 100);

    const filter = {};
    if (status && ALLOWED_STATUSES.has(String(status).toLowerCase())) {
      filter.status = String(status).toLowerCase();
    }
    if (email) {
      filter.gmail = { $regex: String(email).trim(), $options: "i" };
    }
    if (moduleKey) {
      filter.module = String(moduleKey).trim();
    }
    if (subject) {
      filter.subject = { $regex: String(subject).trim(), $options: "i" };
    }
    if (q) {
      const rx = new RegExp(String(q).trim(), "i");
      filter.$or = [
        { name: rx },
        { gmail: rx },
        { number: rx },
        { subject: rx },
        { module: rx },
      ];
    }

    if (since || until) {
      filter.createdAt = {};
      if (since) filter.createdAt.$gte = new Date(since);
      if (until) filter.createdAt.$lte = new Date(until);
    }

    const [items, total] = await Promise.all([
      Submission.find(filter)
        .sort(sort)
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      Submission.countDocuments(filter),
    ]);

    return res.status(200).json({
      ok: true,
      data: items,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        pages: Math.max(Math.ceil(total / limitNum), 1),
      },
    });
  } catch (err) {
    console.error("listSubmissions error:", err);
    return res
      .status(500)
      .json({ ok: false, error: "Failed to fetch submissions." });
  }
}

// PATCH /api/submissions/:id
// Admin-only: update status (pending/approved/revoked) and optional expiry.
async function updateSubmissionStatus(req, res) {
  try {
    if (!ensureOwner(req)) {
      return res.status(403).json({ ok: false, error: "Forbidden" });
    }

    const id = req.params.id || req.body.id;
    if (!id) {
      return res.status(400).json({ ok: false, error: "Submission id required." });
    }

    const body = pick(req.body || {}, [
      "status",
      "planKey",
      "durationDays",
      "expiresAt",
      "adminNote",
    ]);

    const update = {};
    let nextStatus = String(body.status || "").toLowerCase();
    if (nextStatus && !ALLOWED_STATUSES.has(nextStatus)) {
      return res
        .status(400)
        .json({ ok: false, error: "Invalid status value." });
    }
    if (nextStatus) update.status = nextStatus;

    // expiry logic: explicit expiresAt > durationDays > planKey->days
    const now = new Date();
    if (body.expiresAt) {
      const exp = new Date(body.expiresAt);
      if (!isNaN(exp.getTime())) update.expiresAt = exp;
    } else {
      const days =
        parseInt(body.durationDays, 10) ||
        planKeyToDays(body.planKey || undefined);
      if (Number.isFinite(days) && days > 0) {
        const exp = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
        update.expiresAt = exp;
      }
    }

    if (body.adminNote != null) {
      update.adminNote = trim(body.adminNote);
    }

    update.updatedAt = now;

    const updated = await Submission.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true }
    ).lean();

    if (!updated) {
      return res.status(404).json({ ok: false, error: "Submission not found." });
    }

    return res.status(200).json({ ok: true, data: updated });
  } catch (err) {
    console.error("updateSubmissionStatus error:", err);
    return res
      .status(500)
      .json({ ok: false, error: "Failed to update submission." });
  }
}

module.exports = {
  createSubmission,
  listSubmissions,
  updateSubmissionStatus,
};
