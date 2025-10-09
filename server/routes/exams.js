// server/routes/exams.js
import express from "express";
import multer from "multer";
import isOwner from "../middlewares/isOwnerWrapper.js";
import Exam from "../models/Exam.js";
import ModuleTemplate from "../models/ModuleTemplate.js";
import ExamAccess from "../models/ExamAccess.js";
import StudyProgress from "../models/StudyProgress.js";
import { uploadBuffer, deleteByUrl, r2GetObjectStreamByUrl } from "../utils/r2.js";
import { extractOCRFromBuffer } from "../utils/ocr.js";

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

/* ---------------- helpers ---------------- */
const hhmmToMinutes = (hhmm="00:00") => {
  const m = String(hhmm).match(/^(\d{2}):(\d{2})$/);
  if (!m) return 0;
  return +m[1] * 60 + +m[2];
};
const floorUTC = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const daysBetweenUTC = (a,b) => Math.floor((floorUTC(a) - floorUTC(b)) / 86400000);

/* ---------------- Exams ------------------ */
// List exams (public)
router.get("/", async (_req, res) => {
  const items = await Exam.find({}).sort({ createdAt: -1 }).lean();
  res.json({ success: true, items });
});

// Create exam (admin)
router.post("/", isOwner, express.json(), async (req, res) => {
  const { examId, name } = req.body || {};
  if (!examId || !name) return res.status(400).json({ success: false, message: "examId & name required" });
  const doc = await Exam.findOneAndUpdate({ examId }, { name, scheduleMode: "cohort" }, { upsert: true, new: true });
  res.json({ success: true, item: doc });
});

/* --------------- Templates ---------------- */

// List templates for an exam (public)
router.get("/:examId/templates", async (req, res) => {
  const list = await ModuleTemplate.find({ examId: req.params.examId }).sort({ dayIndex: 1, slot: 1 }).lean();
  res.json({ success: true, items: list });
});

// Create/attach files + OCR (admin)
router.post(
  "/:examId/templates",
  isOwner,
  upload.fields([
    { name: "pdf", maxCount: 5 },
    { name: "image", maxCount: 5 },
    { name: "audio", maxCount: 3 },
    { name: "file", maxCount: 10 }, // generic
  ]),
  async (req, res) => {
    const { dayIndex, title, description = "", slot = "08:00", releaseAt, flags = "{}" } = req.body || {};
    const di = Number(dayIndex || 1);
    if (!di || !title || !releaseAt) {
      return res.status(400).json({ success: false, message: "dayIndex, title, releaseAt required" });
    }

    const tmpl = new ModuleTemplate({
      examId: req.params.examId,
      dayIndex: di,
      slot: slot || "08:00",
      releaseAt: new Date(releaseAt),
      title,
      description,
      files: [],
      flags: typeof flags === "string" ? JSON.parse(flags || "{}") : (flags || {}),
    });

    // Collect uploads
    const pushFile = async (buf, orig, mime, type) => {
      const { url } = await uploadBuffer({ keyPrefix: `exams/${req.params.examId}`, originalName: orig, buffer: buf, contentType: mime });
      tmpl.files.push({ type, url });
    };

    const addFrom = async (field, type) => {
      const arr = req.files?.[field] || [];
      for (const f of arr) await pushFile(f.buffer, f.originalname, f.mimetype, type);
    };

    await addFrom("pdf","pdf");
    await addFrom("image","image");
    await addFrom("audio","audio");
    const others = req.files?.file || [];
    for (const f of others) {
      // naïve mime → type
      const mt = (f.mimetype || "").toLowerCase();
      const typ = mt.includes("pdf") ? "pdf" : mt.startsWith("image/") ? "image" : mt.startsWith("audio/") ? "audio" : "pdf";
      await pushFile(f.buffer, f.originalname, f.mimetype, typ);
    }

    // OCR once if requested and we have at least one PDF/image
    if (tmpl.flags?.extractOCR) {
      const pick = (req.files?.pdf?.[0] || req.files?.image?.[0] || req.files?.file?.[0]) || null;
      if (pick?.buffer?.length) {
        tmpl.ocrText = await extractOCRFromBuffer(pick.buffer, { lang: "eng" });
      }
    }

    await tmpl.save();
    res.json({ success: true, item: tmpl });
  }
);

// Patch template (admin)
router.patch("/:examId/templates/:tid", isOwner, upload.none(), async (req, res) => {
  const patch = {};
  ["title","description","slot","releaseAt"].forEach(k => {
    if (req.body[k] != null) patch[k] = k === "releaseAt" ? new Date(req.body[k]) : req.body[k];
  });
  if (req.body.dayIndex != null) patch.dayIndex = Number(req.body.dayIndex);
  if (req.body.flags != null) patch.flags = typeof req.body.flags === "string" ? JSON.parse(req.body.flags) : req.body.flags;

  const updated = await ModuleTemplate.findOneAndUpdate(
    { _id: req.params.tid, examId: req.params.examId },
    { $set: patch },
    { new: true }
  );
  if (!updated) return res.status(404).json({ success: false, message: "Not found" });
  res.json({ success: true, item: updated });
});

// Delete template (admin) + storage cleanup
router.delete("/:examId/templates/:tid", isOwner, async (req, res) => {
  const doc = await ModuleTemplate.findOneAndDelete({ _id: req.params.tid, examId: req.params.examId });
  if (!doc) return res.status(404).json({ success: false, message: "Not found" });
  for (const f of doc.files || []) await deleteByUrl(f.url);
  res.json({ success: true, removed: doc });
});

// Quick schedule placeholders (admin)
router.post("/:examId/templates/quick-schedule", isOwner, express.json(), async (req, res) => {
  const { startDate, days = 30, time = "09:00", freq = "DAILY", timezone = "UTC", defaults = {} } = req.body || {};
  if (!startDate) return res.status(400).json({ success: false, message: "startDate required" });

  const items = [];
  const base = new Date(startDate);
  for (let i = 0; i < Number(days || 30); i++) {
    // weekday filter
    if (freq === "WEEKDAYS") {
      const day = (base.getUTCDay() + i) % 7;
      const isWeekend = day === 0 || day === 6;
      if (isWeekend) continue;
    }
    const d = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate() + i));
    // apply time (HH:mm in UTC)
    const [H,M] = (time || "09:00").split(":").map(x => +x);
    d.setUTCHours(H || 0, M || 0, 0, 0);

    items.push({
      examId: req.params.examId,
      dayIndex: i + 1,
      slot: time || "09:00",
      releaseAt: d,
      title: `Day ${i+1}`,
      description: "",
      files: [],
      flags: {
        extractOCR: !!defaults.extractOCR,
        showOriginal: defaults.showOriginal != null ? !!defaults.showOriginal : true,
        allowDownload: !!defaults.allowDownload,
        highlight: !!defaults.highlight,
        background: defaults.background || "none",
      }
    });
  }
  const created = await ModuleTemplate.insertMany(items);
  res.json({ success: true, items: created });
});

/* ---------------- Access ------------------ */

// List access (admin) OR get my access if email provided (public)
router.get("/:examId/access", async (req, res) => {
  const { email } = req.query;
  if (email) {
    const acc = await ExamAccess.findOne({ userEmail: String(email), examId: req.params.examId, status: "active" }).lean();
    return res.json({ success: true, item: acc || null });
  }
  // admin list
  const items = await ExamAccess.find({ examId: req.params.examId }).sort({ createdAt: -1 }).lean();
  res.json({ success: true, items });
});

// Grant access (admin)
router.post("/:examId/access/grant", isOwner, express.json(), async (req, res) => {
  const { email, planDays = 30, startAt } = req.body || {};
  if (!email) return res.status(400).json({ success: false, message: "email required" });
  const start = startAt ? new Date(startAt) : new Date();
  const expiry = new Date(start.getTime() + Number(planDays) * 86400000);

  // archive previous
  await ExamAccess.updateMany({ userEmail: email, examId: req.params.examId, status: "active" }, { $set: { status: "archived" } });
  const created = await ExamAccess.create({ userEmail: email, examId: req.params.examId, planDays: Number(planDays), startAt: start, expiryAt: expiry, status: "active" });

  // reset progress
  await StudyProgress.findOneAndUpdate({ userEmail: email, examId: req.params.examId }, { $set: { completedDays: [] } }, { upsert: true, new: true });

  res.json({ success: true, item: created });
});

// Revoke (admin)
router.post("/:examId/access/revoke", isOwner, express.json(), async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ success: false, message: "email required" });
  await ExamAccess.updateMany({ userEmail: email, examId: req.params.examId, status: "active" }, { $set: { status: "archived" } });
  res.json({ success: true });
});

/* ---------------- User view ---------------- */

// Overview/progress for cards
router.get("/:examId/overview", async (req, res) => {
  const email = String(req.query.email || "");
  const examId = req.params.examId;
  const acc = email ? await ExamAccess.findOne({ userEmail: email, examId, status: "active" }) : null;
  const total = await ModuleTemplate.countDocuments({ examId });
  let completed = 0;
  if (email) {
    const sp = await StudyProgress.findOne({ userEmail: email, examId });
    completed = sp?.completedDays?.length || 0;
  }
  res.json({ success: true, total, completed, access: acc ? { startAt: acc.startAt, expiryAt: acc.expiryAt, planDays: acc.planDays } : null });
});

// Today list (cohort calculation)
router.get("/:examId/today", async (req, res) => {
  const email = String(req.query.email || "");
  const now = new Date();
  const examId = req.params.examId;

  const acc = await ExamAccess.findOne({ userEmail: email, examId, status: "active" });
  const hasAccess = !!acc && now <= acc.expiryAt;

  let dayIndex = 1;
  if (acc) {
    const delta = daysBetweenUTC(now, acc.startAt);
    dayIndex = Math.max(1, Math.min(acc.planDays, delta + 1));
  }

  const modules = await ModuleTemplate.find({ examId, dayIndex }).sort({ slot: 1 }).lean();

  const nowMins = now.getUTCHours() * 60 + now.getUTCMinutes();
  const list = modules.map(m => {
    const released = m.releaseAt <= now;
    const slotMins = hhmmToMinutes(m.slot || "00:00");
    const slotUnlocked = nowMins >= slotMins;
    const unlocked = hasAccess && released && slotUnlocked;
    const willUnlockAt = !slotUnlocked ? m.slot : null;
    return {
      id: String(m._id),
      title: m.title,
      description: m.description || "",
      slot: m.slot,
      releaseAt: m.releaseAt,
      unlocked,
      willUnlockAt,
      files: m.files,
      flags: m.flags,
      ocrText: unlocked ? (m.ocrText || "") : "", // hide OCR if locked
    };
  });

  res.json({ success: true, dayIndex, items: list, hasAccess });
});

// Mark complete (increments progress or resets/removes)
router.post("/:examId/complete-day", express.json(), async (req, res) => {
  const { email, dayIndex, done = true } = req.body || {};
  if (!email || !dayIndex) return res.status(400).json({ success: false, message: "email & dayIndex required" });
  const doc = await StudyProgress.findOneAndUpdate(
    { userEmail: email, examId: req.params.examId },
    done
      ? { $addToSet: { completedDays: Number(dayIndex) } }
      : { $pull: { completedDays: Number(dayIndex) } },
    { upsert: true, new: true }
  );
  res.json({ success: true, item: doc });
});

/* ---------------- Stream proxy (images/pdf/audio via server) --------------- */
router.get("/stream", async (req, res) => {
  try {
    let src = String(req.query.src || "").trim();
    if (!src) return res.status(400).send("Missing src");

    const range = req.headers.range;

    // Prefer credentialed R2 read if URL is our R2
    try {
      const obj = await r2GetObjectStreamByUrl(src, range);
      if (obj) {
        const status = obj.ContentRange ? 206 : 200;
        const headers = {
          "Content-Type": obj.ContentType || "application/octet-stream",
          "Accept-Ranges": "bytes",
          "Cache-Control": obj.CacheControl || "public, max-age=86400",
          "Access-Control-Expose-Headers": "Content-Length,Content-Range,Accept-Ranges",
          "Cross-Origin-Resource-Policy": "cross-origin",
          "Content-Disposition": obj.ContentDisposition || 'inline; filename="asset"',
          Vary: "Range",
        };
        if (obj.ContentLength != null) headers["Content-Length"] = String(obj.ContentLength);
        if (obj.ContentRange) headers["Content-Range"] = obj.ContentRange;
        res.writeHead(status, headers);
        obj.Body.on("error", () => { try { res.end(); } catch {} }).pipe(res);
        return;
      }
    } catch {}

    // Fallback: plain proxy
    const headers = range ? { Range: range } : {};
    const upstream = await fetch(src, { headers });
    const status = upstream.status === 206 ? 206 : upstream.status;
    if (status === 200 || status === 206) {
      const h = {
        "Content-Type": upstream.headers.get("content-type") || "application/octet-stream",
        "Accept-Ranges": "bytes",
        "Cache-Control": "public, max-age=86400",
        "Access-Control-Expose-Headers": "Content-Length,Content-Range,Accept-Ranges",
        "Cross-Origin-Resource-Policy": "cross-origin",
        "Content-Disposition": 'inline; filename="asset"',
        Vary: "Range",
      };
      const len = upstream.headers.get("content-length");
      const cr  = upstream.headers.get("content-range");
      if (len) h["Content-Length"] = len;
      if (cr)  h["Content-Range"]  = cr;

      res.writeHead(status, h);
      if (!upstream.body) return res.end();
      const { Readable } = await import("node:stream");
      Readable.fromWeb(upstream.body).on("error", () => { try { res.end(); } catch {} }).pipe(res);
      return;
    }

    const text = await upstream.text().catch(() => "Upstream error");
    res.set({ "Content-Type": "text/plain; charset=utf-8", "Access-Control-Expose-Headers": "Content-Length,Content-Range,Accept-Ranges", "Cross-Origin-Resource-Policy": "cross-origin" });
    res.status(upstream.status || 502).send(text);
  } catch (e) {
    console.error("exams stream error:", e);
    if (!res.headersSent) res.status(502).send("Upstream error");
    else try { res.end(); } catch {}
  }
});

/* ✅ NEW: overlay/meta endpoints (match frontend calls) --------------------- */

// Admin meta for editor (price, trialDays, overlay)
router.get("/:examId/meta", isOwner, async (req, res) => {
  const exam = await Exam.findOne({ examId: req.params.examId }).lean();
  if (!exam) return res.status(404).json({ success: false, message: "Exam not found" });
  const { price = 0, trialDays = 3, overlay = {}, name, examId } = exam;
  res.json({ success: true, price, trialDays, overlay: overlay || {}, name, examId });
});

// GET overlay-config (admin)
router.get("/:examId/overlay-config", isOwner, async (req, res) => {
  const exam = await Exam.findOne({ examId: req.params.examId }).lean();
  const overlay = exam?.overlay || {
    mode: "offset-days",           // "offset-days" | "fixed-date" | "never"
    offsetDays: 3,
    fixedAt: null,
  };
  res.json({
    success: true,
    examId: req.params.examId,
    price: Number(exam?.price ?? 0),
    trialDays: Number(exam?.trialDays ?? 3),
    overlay,
  });
});

// PATCH overlay-config (admin) — also accepts POST for compatibility
async function saveOverlayHandler(req, res) {
  const { examId } = req.params;
  const body = req.body || {};
  const update = {
    ...(body.price != null ? { price: Number(body.price) || 0 } : {}),
    ...(body.trialDays != null ? { trialDays: Number(body.trialDays) || 0 } : {}),
    overlay: {
      ...(body.mode ? { mode: body.mode } : {}),
      ...(body.offsetDays != null ? { offsetDays: Number(body.offsetDays) || 0 } : {}),
      ...(Object.prototype.hasOwnProperty.call(body, "fixedAt")
        ? { fixedAt: body.fixedAt ? new Date(body.fixedAt) : null }
        : {}),
    },
  };

  const doc = await Exam.findOneAndUpdate(
    { examId },
    { $set: update },
    { new: true, upsert: true }
  ).lean();

  res.json({ success: true, exam: doc });
}
router.patch("/:examId/overlay-config", isOwner, express.json(), saveOverlayHandler);
router.post("/:examId/overlay-config", isOwner, express.json(), saveOverlayHandler);
/* ------------------------------------------------------------------------- */

/* ===== Overlay Config (GET/POST) — raw DB for legacy clients ===== */
router.get('/api/prep/exams/:examId/overlay-config', async (req, res) => {
  try {
    const { examId } = req.params;
    const db = req.app.get('db');
    const exam = await db.collection('prep_exams').findOne({ examId });

    // default config if not set yet
    const overlay = exam?.overlay || {
      price: Number(exam?.price ?? 0),
      trialDays: Number(exam?.trialDays ?? 3),
      mode: 'planDayTime',         // 'planDayTime' | 'afterN' | 'fixed'
      showOnDay: 1,                // which plan day to show on
      showAtLocal: '09:00',        // HH:mm (admin local time)
      daysAfterStart: 3,           // legacy support
      fixedAt: null                // legacy support
    };

    res.json({ success: true, examId, overlay });
  } catch (e) {
    console.error('overlay-config GET error', e);
    res.status(500).json({ success: false, error: 'server_error' });
  }
});

const requireOwner = (req, res, next) => {
  const key = req.get('X-Owner-Key');
  if (!key || key !== process.env.OWNER_KEY) return res.status(401).json({ error: 'unauthorized' });
  next();
};

router.post('/api/prep/exams/:examId/overlay-config', requireOwner, express.json(), async (req, res) => {
  try {
    const { examId } = req.params;
    const db = req.app.get('db');
    const b = req.body || {};

    // accept both new and legacy fields; keep old ones for compatibility
    const overlay = {
      price: Number(b.price) || 0,
      trialDays: Number(b.trialDays) || 0,
      mode: ['planDayTime','afterN','fixed'].includes(b.mode) ? b.mode : 'planDayTime',
      showOnDay: Number(b.showOnDay) || 1,
      showAtLocal: (b.showAtLocal || '09:00').slice(0,5), // HH:mm
      daysAfterStart: Number(b.daysAfterStart) || 0,
      fixedAt: b.fixedAt || null,
    };

    await db.collection('prep_exams').updateOne(
      { examId },
      { $set: { overlay, price: overlay.price, trialDays: overlay.trialDays } },
      { upsert: true }
    );

    res.json({ success: true });
  } catch (e) {
    console.error('overlay-config POST error', e);
    res.status(500).json({ success: false, error: 'server_error' });
  }
});
/* ===== /Overlay Config ===== */

/* ---------------- error handler ---------------- */
router.use((err, _req, res, _next) => {
  console.error("Exams route error:", err);
  res.status(err.status || 500).json({ success: false, message: err.message || "Server error" });
});

export default router;
