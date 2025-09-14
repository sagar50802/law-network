// server/routes/scholar.js
const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { randomBytes } = require("crypto");

const ScholarGroup = require("../models/ScholarGroup");
const ScholarMembership = require("../models/ScholarMembership");
const ScholarMessage = require("../models/ScholarMessage");

const router = express.Router();

// ensure uploads dir
const UP_DIR = path.join(__dirname, "..", "uploads", "scholar");
fs.mkdirSync(UP_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UP_DIR),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^\w.\-()+\s]/g, "_");
    cb(null, `${Date.now()}-${safe}`);
  }
});
const upload = multer({ storage });

function isOwner(req) {
  const adminKey = process.env.ADMIN_KEY || "LAWNOWNER2025";
  return (req.headers["x-owner-key"] || req.headers["x-admin-key"]) === adminKey;
}

function fileUrl(req, relPath) {
  const base = `${req.protocol}://${req.get("host")}`;
  return `${base}/uploads/scholar/${relPath}`;
}

// -------- Groups --------

// Create group (admin only)
router.post("/groups", async (req, res) => {
  try {
    if (!isOwner(req)) return res.status(403).json({ success: false, message: "Admin only" });

    const { name, description = "", deadlineAt = null, createdBy = "owner" } = req.body;
    if (!name) return res.status(400).json({ success: false, message: "Name required" });

    const inviteCode = randomBytes(3).toString("hex").toUpperCase(); // 6-char
    const group = await ScholarGroup.create({ name, description, deadlineAt, createdBy, inviteCode });
    // owner is auto-member
    await ScholarMembership.create({
      groupId: group._id, email: "owner@local", name: "Owner", role: "owner"
    });
    res.json({ success: true, group });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "Failed to create group" });
  }
});

// List groups (basic public list)
router.get("/groups", async (_req, res) => {
  const groups = await ScholarGroup.find().sort({ createdAt: -1 }).lean();
  res.json({ success: true, groups });
});

// Join group (with invite code)
router.post("/groups/:id/join", async (req, res) => {
  try {
    const { name, email, inviteCode } = req.body;
    const group = await ScholarGroup.findById(req.params.id);
    if (!group) return res.status(404).json({ success: false, message: "Group not found" });
    if (!name || !email) return res.status(400).json({ success: false, message: "Name+email required" });
    if (group.inviteCode !== (inviteCode || "").toUpperCase()) {
      return res.status(403).json({ success: false, message: "Invalid invite code" });
    }
    const mem = await ScholarMembership.findOneAndUpdate(
      { groupId: group._id, email },
      { $setOnInsert: { name, role: "member" } },
      { new: true, upsert: true }
    );
    res.json({ success: true, membership: mem });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "Join failed" });
  }
});

// Get group + my membership (by email)
router.get("/groups/:id", async (req, res) => {
  const group = await ScholarGroup.findById(req.params.id).lean();
  if (!group) return res.status(404).json({ success: false, message: "Group not found" });
  const email = (req.query.email || "").trim().toLowerCase();
  const membership = email ? await ScholarMembership.findOne({ groupId: group._id, email }) : null;
  res.json({ success: true, group, membership });
});

// -------- Messages --------

// Fetch messages (since = ISO date optional)
router.get("/groups/:id/messages", async (req, res) => {
  const since = req.query.since ? new Date(req.query.since) : null;
  const q = { groupId: req.params.id };
  if (since) q.createdAt = { $gt: since };

  const msgs = await ScholarMessage.find(q).sort({ createdAt: 1 }).limit(200).lean();
  res.json({ success: true, messages: msgs });
});

// Send message (must be member; simple check by email)
router.post("/groups/:id/messages", upload.array("files", 6), async (req, res) => {
  try {
    const { authorEmail, authorName, text = "", replyTo = null } = req.body;
    if (!authorEmail || !authorName)
      return res.status(400).json({ success: false, message: "Author required" });

    const mem = await ScholarMembership.findOne({ groupId: req.params.id, email: authorEmail });
    if (!mem) return res.status(403).json({ success: false, message: "Join group first" });

    const atts = (req.files || []).map(f => ({
      filename: f.originalname,
      url: fileUrl(req, path.basename(f.path)),
      mime: f.mimetype,
      size: f.size
    }));

    const msg = await ScholarMessage.create({
      groupId: req.params.id, authorEmail, authorName, text, replyTo: replyTo || null, attachments: atts
    });
    res.json({ success: true, message: msg });
  } catch (e) {
    console.error(e);
    res.status(500).json({ success: false, message: "Send failed" });
  }
});

module.exports = router;
