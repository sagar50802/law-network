import express from "express";
import mongoose from "mongoose";
import fetch from "node-fetch";
import { isAdmin } from "./utils.js";

const router = express.Router();

/* ----------------------------- Model ----------------------------- */
const LabWizardSchema = new mongoose.Schema(
  {
    userEmail: String,
    module: String,            // proposal / dissertation / etc.
    data: Object,              // form or metadata
    step: Number,
    percent: Number,
    labOption: String,         // "self" | "pro"
    status: { type: String, default: "in_progress" }, // auto-updates to "ready"
    journeyData: Object,       // notebook-style auto-saved content
  },
  { timestamps: true }
);

const LabWizard =
  mongoose.models.LabWizard || mongoose.model("LabWizard", LabWizardSchema);

/* ----------------------------- Submit / Update ----------------------------- */
router.post("/submit", async (req, res) => {
  try {
    const { email, module, data, step, percent, labOption } = req.body;
    if (!email || !module)
      return res.status(400).json({ error: "Missing required fields" });

    // ✅ auto-promote “Create in Your Lab” to ready
    let status = "in_progress";
    if (labOption && labOption.toLowerCase() === "self") status = "ready";

    const doc = await LabWizard.findOneAndUpdate(
      { userEmail: email, module },
      {
        $set: { data, step, percent, labOption, status },
      },
      { upsert: true, new: true }
    );

    res.json({ ok: true, doc });
  } catch (err) {
    console.error("labwizard submit error", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ----------------------------- Notebook Progress Save ----------------------------- */
router.post("/journey/save", async (req, res) => {
  try {
    const { email, module, journeyData } = req.body;
    if (!email || !module)
      return res.status(400).json({ error: "Missing required fields" });

    const doc = await LabWizard.findOneAndUpdate(
      { userEmail: email, module },
      { $set: { journeyData, updatedAt: new Date() } },
      { upsert: true, new: true }
    );

    res.json({ ok: true, doc });
  } catch (err) {
    console.error("labwizard journey save error", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ----------------------------- Fetch Notebook Progress ----------------------------- */
router.get("/progress", async (req, res) => {
  try {
    const { email, module } = req.query;
    if (!email || !module)
      return res.status(400).json({ error: "Missing query parameters" });

    const doc = await LabWizard.findOne({ userEmail: email, module });
    if (!doc) return res.json({ ok: false, journeyData: null });
    res.json({ ok: true, journeyData: doc.journeyData || {} });
  } catch (err) {
    console.error("labwizard progress fetch error", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ----------------------------- Wikipedia Proxy ----------------------------- */
router.get("/wiki/:topic", async (req, res) => {
  try {
    const topic = encodeURIComponent(req.params.topic);
    const url = `https://en.wikipedia.org/api/rest_v1/page/summary/${topic}`;
    const r = await fetch(url);
    const j = await r.json();
    if (j.extract) {
      res.json({ ok: true, title: j.title, extract: j.extract });
    } else {
      res.json({ ok: false, extract: "" });
    }
  } catch (err) {
    console.error("wiki proxy error", err);
    res.json({ ok: false, extract: "" });
  }
});

/* ----------------------------- Fetch User Data ----------------------------- */
router.get("/user", async (req, res) => {
  try {
    const { email } = req.query;
    if (!email) return res.status(400).json({ error: "Missing email" });
    const docs = await LabWizard.find({ userEmail: email }).sort({
      updatedAt: -1,
    });
    res.json({ items: docs });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

/* ----------------------------- Admin Inbox ----------------------------- */
router.get("/admin/inbox", isAdmin, async (req, res) => {
  try {
    const page = parseInt(req.query.page || 1);
    const limit = parseInt(req.query.limit || 20);
    const skip = (page - 1) * limit;

    const total = await LabWizard.countDocuments();
    const items = await LabWizard.find({})
      .sort({ updatedAt: -1 })
      .skip(skip)
      .limit(limit);

    res.json({ total, items });
  } catch (err) {
    console.error("labwizard admin inbox", err);
    res.status(500).json({ error: "Server error" });
  }
});

/* ----------------------------- Admin Detail ----------------------------- */
router.get("/admin/view/:id", isAdmin, async (req, res) => {
  try {
    const doc = await LabWizard.findById(req.params.id);
    if (!doc) return res.status(404).json({ error: "Not found" });
    res.json({ doc });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

/* ----------------------------- Admin Status Update ----------------------------- */
router.patch("/admin/status/:id", isAdmin, async (req, res) => {
  try {
    const { status } = req.body;
    const doc = await LabWizard.findByIdAndUpdate(
      req.params.id,
      { $set: { status } },
      { new: true }
    );
    res.json({ ok: true, doc });
  } catch (err) {
    res.status(500).json({ error: "Server error" });
  }
});

export default router;
