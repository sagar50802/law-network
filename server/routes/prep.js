// server/routes/prep.js
import express from "express";
import multer from "multer";
import mongoose from "mongoose";
import { isAdmin } from "./utils.js";
import PrepExam from "../models/PrepExam.js";
import PrepModule from "../models/PrepModule.js";
import PrepAccess from "../models/PrepAccess.js";
import PrepProgress from "../models/PrepProgress.js";

const router = express.Router();

/* --------- helpers --------- */

// 40 MB memory storage exactly like you had
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 40 * 1024 * 1024 } });

function truthy(v) {
  return ["true", "1", "on", "yes"].includes(String(v).trim().toLowerCase());
}

// Optional R2 + GridFS fallback
let R2 = null;
try { R2 = await import("../utils/r2.js"); } catch { R2 = null; }

function grid(bucket) {
  const db = mongoose.connection?.db;
  if (!db) return null;
  return new mongoose.mongo.GridFSBucket(db, { bucketName: bucket });
}

function safeName(filename = "file") {
  return String(filename).replace(/\s+/g, "_").replace(/[^\w.\-]/g, "");
}

async function storeBuffer({ buffer, filename, mime, bucket = "prep" }) {
  const name = safeName(filename || "file");
  const contentType = mime || "application/octet-stream";

  // Prefer R2 if available
  if (R2?.r2Enabled?.() && R2?.uploadBuffer) {
    try {
      const url = await R2.uploadBuffer(buffer, name, contentType);
      return { url, via: "r2" };
    } catch (e) {
      console.warn("[prep] R2 upload failed, falling back to GridFS:", e?.message || e);
    }
  }

  // GridFS
  const g = grid(bucket);
  if (!g) throw Object.assign(new Error("DB not connected"), { status: 503 });
  const id = await new Promise((resolve, reject) => {
    const ws = g.openUploadStream(name, { contentType });
    ws.on("error", reject);
    ws.on("finish", () => resolve(ws.id));
    ws.end(buffer);
  });
  return { url: `/api/files/${bucket}/${String(id)}`, via: "gridfs" };
}

// OCR helper (graceful)
let OCR = null;
try { OCR = await import("../utils/ocr.js"); } catch { OCR = null; }

async function runOcrSafe(buffer) {
  try {
    if (!buffer) return "";
    if (OCR?.extractOCRFromBuffer) return await OCR.extractOCRFromBuffer(buffer, "eng+hin");
    if (OCR?.runOCR)                return await OCR.runOCR(buffer, "eng+hin");
    return "";
  } catch (e) {
    console.warn("[prep] OCR failed:", e?.message || e);
    return "";
  }
}

/* ================= Exams ================= */

router.get("/exams", async (_req, res) => {
  const exams = await PrepExam.find({}).sort({ name: 1 }).lean();
  res.json({ success: true, exams });
});

router.post("/exams", isAdmin, async (req, res) => {
  const { examId, name, scheduleMode = "cohort" } = req.body || {};
  if (!examId || !name) return res.status(400).json({ success: false, error: "examId & name required" });
  const doc = await PrepExam.findOneAndUpdate(
    { examId },
    { $set: { name, scheduleMode } },
    { upsert: true, new: true }
  );
  res.json({ success: true, exam: doc });
});

/* ================= Templates (modules) ================= */

// list templates for an exam
router.get("/templates", async (req, res) => {
  const { examId } = req.query || {};
  if (!examId) return res.status(400).json({ success: false, error: "examId required" });
  const items = await PrepModule.find({ examId }).sort({ dayIndex: 1, slotMin: 1 }).lean();
  res.json({ success: true, items });
});

// create module
router.post(
  "/templates",
  isAdmin,
  upload.fields([
    { name: "images", maxCount: 12 },
    { name: "pdf",    maxCount: 1  },
    { name: "audio",  maxCount: 1  },
    { name: "video",  maxCount: 1  },
  ]),
  async (req, res) => {
    try {
      const {
        examId, dayIndex, slotMin = 0, title = "", description = "",
        // NEW: schedule + manual text
        releaseAt, manualText = "",
        // flags
        extractOCR = "false", showOriginal = "false", allowDownload = "false",
        highlight = "false", background = "", deferOCRUntilRelease = "false",
      } = req.body || {};

      if (!examId || !dayIndex) {
        return res.status(400).json({ success: false, error: "examId & dayIndex required" });
      }

      // files
      const files = [];
      const addFile = (kind, f) => files.push({ kind, url: f.url, mime: f.mime || f.mimetype || "" });
      const toStore = async (f) =>
        storeBuffer({
          buffer: f.buffer,
          filename: f.originalname || f.fieldname,
          mime: f.mimetype || "application/octet-stream",
        });

      for (const f of req.files?.images || []) {
        try { addFile("image", { ...(await toStore(f)), mime: f.mimetype }); } catch {}
      }
      if (req.files?.pdf?.[0])   { const f = req.files.pdf[0];   try { addFile("pdf",   { ...(await toStore(f)), mime: f.mimetype }); } catch {} }
      if (req.files?.audio?.[0]) { const f = req.files.audio[0]; try { addFile("audio", { ...(await toStore(f)), mime: f.mimetype }); } catch {} }
      if (req.files?.video?.[0]) { const f = req.files.video[0]; try { addFile("video", { ...(await toStore(f)), mime: f.mimetype }); } catch {} }

      // schedule
      const relAt = releaseAt ? new Date(releaseAt) : null;
      const now = new Date();
      const status = relAt && relAt > now ? "scheduled" : "released";

      // flags
      const flags = {
        extractOCR: truthy(extractOCR),
        showOriginal: truthy(showOriginal),
        allowDownload: truthy(allowDownload),
        highlight: truthy(highlight),
        background,
        deferOCRUntilRelease: truthy(deferOCRUntilRelease),
      };

      // OCR now (only if extract is ON, manualText is empty, and not deferred)
      let ocrText = "";
      if (flags.extractOCR && !truthy(deferOCRUntilRelease) && !manualText) {
        const src = (req.files?.images?.[0] || req.files?.pdf?.[0])?.buffer;
        if (src?.length) ocrText = await runOcrSafe(src);
      }

      const doc = await PrepModule.create({
        examId,
        dayIndex: Number(dayIndex),
        slotMin: Number(slotMin || 0),
        title,
        description,
        files,
        flags,
        text: manualText || "",   // << store pasted text
        ocrText,
        releaseAt: relAt || undefined,
        status,
      });

      res.json({ success: true, item: doc });
    } catch (e) {
      console.error("[prep] create template failed:", e);
      res.status(500).json({ success: false, error: e?.message || "server error" });
    }
  }
);

// update module (edit flags, add files, re-OCR)
router.patch(
  "/templates/:id",
  isAdmin,
  upload.fields([
    { name: "images", maxCount: 12 },
    { name: "pdf",    maxCount: 1  },
    { name: "audio",  maxCount: 1  },
    { name: "video",  maxCount: 1  },
  ]),
  async (req, res) => {
    try {
      const doc = await PrepModule.findById(req.params.id);
      if (!doc) return res.status(404).json({ success: false, error: "Not found" });

      // basic fields
      if (req.body.title       != null) doc.title = req.body.title;
      if (req.body.description != null) doc.description = req.body.description;
      if (req.body.dayIndex    != null) doc.dayIndex = Number(req.body.dayIndex);
      if (req.body.slotMin     != null) doc.slotMin = Number(req.body.slotMin);
      if (req.body.manualText  != null) doc.text    = req.body.manualText;

      // schedule
      if (req.body.releaseAt != null) {
        const rel = req.body.releaseAt ? new Date(req.body.releaseAt) : null;
        doc.releaseAt = rel || undefined;
        const now = new Date();
        doc.status = rel && rel > now ? "scheduled" : "released";
      }

      // flags
      const setFlag = (k, v) => (doc.flags[k] = v);
      if (req.body.extractOCR           != null) setFlag("extractOCR",           truthy(req.body.extractOCR));
      if (req.body.showOriginal         != null) setFlag("showOriginal",         truthy(req.body.showOriginal));
      if (req.body.allowDownload        != null) setFlag("allowDownload",        truthy(req.body.allowDownload));
      if (req.body.highlight            != null) setFlag("highlight",            truthy(req.body.highlight));
      if (req.body.background           != null) setFlag("background",           req.body.background);
      if (req.body.deferOCRUntilRelease != null) setFlag("deferOCRUntilRelease", truthy(req.body.deferOCRUntilRelease));

      // new files
      const toStore = async (f) => storeBuffer({
        buffer: f.buffer, filename: f.originalname || f.fieldname, mime: f.mimetype || "application/octet-stream",
      });
      const pushFile = (kind, payload) => doc.files.push({ kind, url: payload.url, mime: payload.mimetype || "" });

      for (const f of req.files?.images || []) { try { pushFile("image", { ...(await toStore(f)), mimetype: f.mimetype }); } catch {} }
      if (req.files?.pdf?.[0])   { const f = req.files.pdf[0];   try { pushFile("pdf",   { ...(await toStore(f)), mimetype: f.mimetype }); } catch {} }
      if (req.files?.audio?.[0]) { const f = req.files.audio[0]; try { pushFile("audio", { ...(await toStore(f)), mimetype: f.mimetype }); } catch {} }
      if (req.files?.video?.[0]) { const f = req.files.video[0]; try { pushFile("video", { ...(await toStore(f)), mimetype: f.mimetype }); } catch {} }

      // optional re-OCR now
      if (truthy(req.body.reOCR) && doc.flags.extractOCR && !doc.flags.deferOCRUntilRelease && !doc.text) {
        const uploaded = (req.files?.images?.[0] || req.files?.pdf?.[0])?.buffer;
        if (uploaded?.length) doc.ocrText = await runOcrSafe(uploaded);
      }

      await doc.save();
      res.json({ success: true, item: doc });
    } catch (e) {
      console.error("[prep] patch template failed:", e);
      res.status(500).json({ success: false, error: e?.message || "server error" });
    }
  }
);

// NEW: delete module
router.delete("/templates/:id", isAdmin, async (req, res) => {
  try {
    const r = await PrepModule.findByIdAndDelete(req.params.id);
    if (!r) return res.status(404).json({ success: false, error: "Not found" });
    res.json({ success: true, removed: r._id });
  } catch (e) {
    res.status(500).json({ success: false, error: e?.message || "server error" });
  }
});

/* ================= Access (cohort) ================= */

router.post("/access/grant", isAdmin, async (req, res) => {
  const { userEmail, examId, planDays = 30, startAt } = req.body || {};
  if (!userEmail || !examId) return res.status(400).json({ success: false, error: "userEmail & examId required" });
  const start  = startAt ? new Date(startAt) : new Date();
  const expiry = new Date(start.getTime() + Number(planDays) * 86400000);

  await PrepAccess.updateMany({ userEmail, examId, status: "active" }, { $set: { status: "archived" } });
  const access = await PrepAccess.create({ userEmail, examId, planDays: Number(planDays), startAt: start, expiryAt: expiry, status: "active" });
  await PrepProgress.findOneAndUpdate({ userEmail, examId }, { $set: { completedDays: [] } }, { upsert: true, new: true });

  res.json({ success: true, access });
});

// summary for user (today)
router.get("/user/summary", async (req, res) => {
  const { examId, email } = req.query || {};
  if (!examId) return res.status(400).json({ success: false, error: "examId required" });

  let access = null;
  if (email) {
    access = await PrepAccess.findOne({ examId, userEmail: email, status: "active" }).lean();
  }
  const now = new Date();
  const planDays = access?.planDays || 3;
  const startAt  = access?.startAt || now;
  const dayIdx   = Math.max(1, Math.min(planDays, Math.floor((now - new Date(startAt)) / 86400000) + 1));

  // released modules for the day (either no releaseAt or already released)
  const modules = await PrepModule
    .find({
      examId,
      dayIndex: dayIdx,
      $or: [{ status: "released" }, { releaseAt: { $exists: false } }],
    })
    .sort({ slotMin: 1 })
    .lean();

  // coming later within the next 24h (for the calendar chip on UI)
  const later = await PrepModule
    .find({
      examId,
      dayIndex: dayIdx,
      status: "scheduled",
      releaseAt: { $gt: now, $lte: new Date(now.getTime() + 24 * 3600 * 1000) },
    })
    .sort({ releaseAt: 1 })
    .select({ title: 1, releaseAt: 1 })
    .lean();

  res.json({ success: true, todayDay: dayIdx, planDays, modules, comingLater: later });
});

// mark complete (fallback to guest if email missing)
router.post("/user/complete", async (req, res) => {
  const { examId, email, dayIndex } = req.body || {};
  if (!examId || !dayIndex) return res.status(400).json({ success: false, error: "examId & dayIndex required" });
  let userKey = (email || "").trim();
  if (!userKey) userKey = `guest:${req.ip || "0.0.0.0"}`;
  const doc = await PrepProgress.findOneAndUpdate(
    { userEmail: userKey, examId },
    { $addToSet: { completedDays: Number(dayIndex) } },
    { upsert: true, new: true }
  );
  res.json({ success: true, progress: doc });
});

/* ================= Light "cron" to flip scheduled → released ================= */

// Every minute: release any scheduled modules whose time has arrived.
// (If you want true cron, you can replace this with node-cron.)
setInterval(async () => {
  try {
    const now = new Date();
    const r = await PrepModule.updateMany(
      { status: "scheduled", releaseAt: { $lte: now } },
      { $set: { status: "released" } }
    );
    if (r.modifiedCount) console.log(`[prep] auto-released ${r.modifiedCount} module(s)`);
  } catch (e) {
    console.warn("[prep] auto-release failed:", e?.message || e);
  }
}, 60_000);

export default router;
