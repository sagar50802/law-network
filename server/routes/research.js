import express from "express";
import multer from "multer";
import fs from "fs";
import path from "path";
import ResearchProposal from "../models/ResearchProposal.js";
import { generatePreviewPDF, generateFullPDF } from "../lib/researchPdf.js";


const router = express.Router();


// ---------- Storage (isolated folder) ----------
const UPLOAD_DIR = path.join(process.cwd(), "server", "uploads", "research");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });
const upload = multer({ storage: multer.diskStorage({
destination: (req, file, cb) => cb(null, UPLOAD_DIR),
filename: (req, file, cb) => {
const safe = String(file.originalname || "file").replace(/\s+/g, "_").replace(/[^\w.\-]/g, "");
cb(null, `${Date.now()}_${safe}`);
},
}), limits: { fileSize: 10 * 1024 * 1024 } });


// ---------- Lightweight auth helpers (replace as needed) ----------
function isOwner(req) {
// Example: derive from session/jwt; here accept email for demo
const email = (req.headers["x-user-email"] || req.query.email || "").toString().trim();
return email;
}
function isAdmin(req) {
const key = (req.headers["x-owner-key"] || req.query.ownerKey || "").toString().trim();
// replace with your real admin logic
return !!key;
}


// ---------- Utilities ----------
const ORDER = ["topic","literature","method","timeline","payment","done"];
function computePercent(steps) {
const completed = steps.filter(s => s.status === "completed").length;
// exclude final done from raw ratio weight (optional); keep simple here
const max = ORDER.length - 1; // without done
return Math.round((completed / max) * 100);
}
function ensureSteps(initial) {
// construct steps with default locked except first
const base = ORDER.map((id, i) => ({ id, status: i === 0 ? "in_progress" : "locked" }));
if (!Array.isArray(initial) || !initial.length) return base;
// merge states if provided
const map = new Map(initial.map(s => [s.id, s]));
return base.map(s => map.get(s.id) || s);
}


// ---------- Routes ----------
// Create draft (pre-payment)
router.post("/proposals", async (req, res) => {
try {
const email = isOwner(req);
const { title, fields = {} } = req.body || {};
const steps = ensureSteps();
const doc = await ResearchProposal.create({ userEmail: email, title, fields, steps, percent: computePercent(steps) });
res.json({ ok: true, id: doc._id });
} catch (e) { res.status(500).json({ ok: false, error: e.message }); }
});


// Update fields for a step (auto-save)
router.patch("/proposals/:id", async (req, res) => {
try {
const id = req.params.id;
const email = isOwner(req);
const { fields, steps } = req.body || {};


const doc = await ResearchProposal.findById(id);
