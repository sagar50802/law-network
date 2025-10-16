// server/routes/research.js
import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import ResearchProposal from "../models/ResearchProposal.js";
import { generatePreviewPDF, generateFullPDF } from "../lib/researchPdf.js";

const router = express.Router();

/* ---------- Storage (isolated) ---------- */
const UPLOAD_DIR = path.join(process.cwd(), "server", "uploads", "research");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const safe = String(file.originalname || "file")
        .replace(/\s+/g, "_")
        .replace(/[^\w.\-]/g, "");
      cb(null, `${Date.now()}_${safe}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
});

/* ---------- Light auth helpers (replace with real auth) ---------- */
function isOwner(req) {
  // You can switch to JWT later; for now we accept an email in header/query
  const email =
    (req.headers["x-user-email"] ||
      req.query.email ||
      req.body?.email ||
      "") + "";
  return email.trim();
}
function isAdmin(req) {
  const key = (req.headers["x-owner-key"] || req.query.ownerKey || "") + "";
  return !!key.trim(); // replace with your real check
}

/* ---------- Utils ---------- */
const ORDER = ["topic", "literature", "method", "timeline", "payment", "done"];

function computePercent(steps = []) {
  const completed = steps.filter((s) => s.status === "completed").length;
  const max = ORDER.length - 1; // exclude "done" from progress %
  return Math.round((completed / max) * 100);
}

function ensureSteps(initial) {
  const base = ORDER.map((id, i) => ({
    id,
    status: i === 0 ? "in_progress" : "locked",
  }));
  if (!Array.isArray(initial) || !initial.length) return base;
  const map = new Map(initial.map((s) => [s.id, s]));
  return base.map((s) => map.get(s.id) || s);
}

/* ---------- Routes ---------- */

// Create draft (pre-payment)
router.post("/proposals", async (req, res) => {
  try {
    const email = isOwner(req);
    const { title = "", fields = {} } = req.body || {};
    const steps = ensureSteps();
    const doc = await ResearchProposal.create({
      userEmail: email || undefined,
      title,
      fields,
      steps,
      percent: computePercent(steps),
    });
    res.json({ ok: true, id: doc._id });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Update fields/steps (autosave)
router.patch("/proposals/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const email = isOwner(req);
    const { fields, steps } = req.body || {};

    const doc = await ResearchProposal.findById(id);
    if (!doc) return res.status(404).json({ ok: false, error: "Not found" });
    if (doc.userEmail !== email && !isAdmin(req))
      return res.status(403).json({ ok: false, error: "Forbidden" });

    if (fields) doc.fields = { ...doc.fields, ...fields };
    if (Array.isArray(steps) && steps.length) doc.steps = steps;
    doc.percent = computePercent(doc.steps);
    doc.lastUpdatedAt = new Date();
    await doc.save();

    res.json({ ok: true, percent: doc.percent, steps: doc.steps });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Admin inbox (paginated)
router.get("/inbox", async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ ok: false, error: "Admin only" });

    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(50, parseInt(req.query.limit || "20", 10));
    const q = (req.query.q || "").trim();

    const find = {};
    if (q) find.title = { $regex: q, $options: "i" };

    const total = await ResearchProposal.countDocuments(find);
    const items = await ResearchProposal.find(find, {
      title: 1,
      userEmail: 1,
      percent: 1,
      steps: 1,
      lastUpdatedAt: 1,
      status: 1,
      "payment.status": 1,
    })
      .sort({ lastUpdatedAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .lean();

    res.json({ ok: true, page, total, items });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Read proposal (owner/admin)
router.get("/proposals/:id", async (req, res) => {
  try {
    const id = req.params.id;
    const email = isOwner(req);
    const doc = await ResearchProposal.findById(id).lean();
    if (!doc) return res.status(404).json({ ok: false, error: "Not found" });
    if (doc.userEmail !== email && !isAdmin(req))
      return res.status(403).json({ ok: false, error: "Forbidden" });
    res.json({ ok: true, doc });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Read a specific section (admin)
router.get("/proposals/:id/section/:milestone", async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ ok: false, error: "Admin only" });
    const id = req.params.id;
    const doc = await ResearchProposal.findById(id).lean();
    if (!doc) return res.status(404).json({ ok: false, error: "Not found" });
    res.json({ ok: true, fields: doc.fields, milestone: req.params.milestone });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Stage gate changes (admin)
router.patch("/proposals/:id/stage/:milestone", async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ ok: false, error: "Admin only" });
    const id = req.params.id;
    const milestone = req.params.milestone;
    const { status } = req.body || {};
    const doc = await ResearchProposal.findById(id);
    if (!doc) return res.status(404).json({ ok: false, error: "Not found" });

    const merged = ensureSteps(doc.steps).map((s) =>
      s.id === milestone
        ? {
            ...s,
            status,
            completedAt: status === "completed" ? new Date() : s.completedAt,
          }
        : s
    );

    doc.steps = merged;
    doc.percent = computePercent(doc.steps);
    doc.lastUpdatedAt = new Date();
    await doc.save();
    res.json({ ok: true, steps: doc.steps, percent: doc.percent });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Final submit (owner/admin)
router.post("/proposals/:id/submit", async (req, res) => {
  try {
    const id = req.params.id;
    const email = isOwner(req);
    const doc = await ResearchProposal.findById(id);
    if (!doc) return res.status(404).json({ ok: false, error: "Not found" });
    if (doc.userEmail !== email && !isAdmin(req))
      return res.status(403).json({ ok: false, error: "Forbidden" });

    doc.steps = ensureSteps(doc.steps).map((s) =>
      s.id === "done" ? { ...s, status: "completed", completedAt: new Date() } : s
    );
    doc.percent = computePercent(doc.steps);
    doc.status = "submitted";
    doc.lastUpdatedAt = new Date();
    await doc.save();

    res.json({ ok: true, status: doc.status, steps: doc.steps, percent: doc.percent });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Payment proof upload (owner/admin)
router.post("/proposals/:id/pay", upload.array("proof", 4), async (req, res) => {
  try {
    const id = req.params.id;
    const email = isOwner(req);
    const { amount = 0, vpa, waNumber } = req.body || {};
    const doc = await ResearchProposal.findById(id);
    if (!doc) return res.status(404).json({ ok: false, error: "Not found" });
    if (doc.userEmail !== email && !isAdmin(req))
      return res.status(403).json({ ok: false, error: "Forbidden" });

    const proofs = (req.files || []).map((f) => ({
      path: f.path.replace(process.cwd(), ""),
      name: f.originalname,
      size: f.size,
    }));

    doc.payment = {
      status: "pending",
      amount: Number(amount) || 0,
      vpa,
      waNumber,
      proofFiles: [...(doc.payment?.proofFiles || []), ...proofs],
    };
    doc.lastUpdatedAt = new Date();
    await doc.save();

    res.json({ ok: true, payment: doc.payment });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// Admin verifies payment
router.post("/proposals/:id/pay/verify", async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ ok: false, error: "Admin only" });
    const id = req.params.id;
    const { verified = true } = req.body || {};
    const doc = await ResearchProposal.findById(id);
    if (!doc) return res.status(404).json({ ok: false, error: "Not found" });

    doc.payment.status = verified ? "verified" : "pending";
    doc.lastUpdatedAt = new Date();
    await doc.save();

    res.json({ ok: true, payment: doc.payment });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

// PDF Preview (1 page, watermark) — owner/admin
router.get("/proposals/:id/pdf/preview", async (req, res) => {
  try {
    const id = req.params.id;
    const email = isOwner(req);
    const doc = await ResearchProposal.findById(id).lean();
    if (!doc) return res.status(404).end();
    if (doc.userEmail !== email && !isAdmin(req)) return res.status(403).end();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename=proposal_preview_${id}.pdf`);
    await generatePreviewPDF(res, doc);
  } catch (_e) {
    res.status(500).end();
  }
});

// PDF Full (payment-gated) — owner/admin
router.get("/proposals/:id/pdf/full", async (req, res) => {
  try {
    const id = req.params.id;
    const email = isOwner(req);
    const doc = await ResearchProposal.findById(id).lean();
    if (!doc) return res.status(404).end();
    if (doc.userEmail !== email && !isAdmin(req)) return res.status(403).end();
    if (doc.payment?.status !== "verified") return res.status(403).end();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=proposal_${id}.pdf`);
    await generateFullPDF(res, doc);
  } catch (_e) {
    res.status(500).end();
  }
});

export default router;
