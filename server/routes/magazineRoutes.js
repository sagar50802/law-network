import express from "express";
import Magazine from "../models/Magazine.js";
import catchAsync from "../utils/catchAsync.js";

const router = express.Router();

/* =====================================================
   GET ALL — MUST BE FIRST
===================================================== */
router.get(
  "/",
  catchAsync(async (req, res) => {
    const list = await Magazine.find()
      .sort({ createdAt: -1 })
      .select("title subtitle slug createdAt");

    res.json({ ok: true, issues: list });
  })
);

/* =====================================================
   CREATE MAGAZINE
===================================================== */
router.post(
  "/",
  catchAsync(async (req, res) => {
    const { title, subtitle, slug, slides } = req.body;

    if (!title || !slug) {
      return res.status(400).json({ ok: false, error: "Missing fields" });
    }

    const exists = await Magazine.findOne({ slug });
    if (exists) {
      return res
        .status(400)
        .json({ ok: false, error: "Slug already exists" });
    }

    // ⭐ sanitize slides to avoid crash
    const safeSlides = (slides || []).map((s, i) => ({
      id: s.id || `s${i + 1}`,
      backgroundUrl: s.backgroundUrl || "",
      rawText: s.rawText || "",
      highlight: s.highlight || "",
    }));

    const created = await Magazine.create({
      title,
      subtitle,
      slug,
      slides: safeSlides,
    });

    res.json({ ok: true, issue: created });
  })
);

/* =====================================================
   UPDATE MAGAZINE
===================================================== */
router.put(
  "/:id",
  catchAsync(async (req, res) => {
    const { title, subtitle, slug, slides } = req.body;

    const mag = await Magazine.findById(req.params.id);
    if (!mag) {
      return res.status(404).json({ ok: false, error: "Magazine not found" });
    }

    // ⭐ sanitize slides
    const safeSlides = (slides || []).map((s, i) => ({
      id: s.id || `s${i + 1}`,
      backgroundUrl: s.backgroundUrl || "",
      rawText: s.rawText || "",
      highlight: s.highlight || "",
    }));

    mag.title = title || "";
    mag.subtitle = subtitle || "";
    mag.slug = slug || mag.slug;
    mag.slides = safeSlides;

    await mag.save();

    res.json({ ok: true, issue: mag });
  })
);

/* =====================================================
   DELETE
===================================================== */
router.delete(
  "/:id",
  catchAsync(async (req, res) => {
    const mag = await Magazine.findById(req.params.id);
    if (!mag) {
      return res.status(404).json({ ok: false, error: "Magazine not found" });
    }

    await mag.deleteOne();
    res.json({ ok: true, message: "Magazine deleted successfully" });
  })
);

/* =====================================================
   GET BY SLUG — MUST BE LAST
   FIX: Use /slug/:slug to avoid route collision
===================================================== */
router.get(
  "/slug/:slug",
  catchAsync(async (req, res) => {
    const issue = await Magazine.findOne({ slug: req.params.slug });

    if (!issue) {
      return res.status(404).json({ ok: false, error: "Issue not found" });
    }

    res.json({ ok: true, issue });
  })
);

export default router;
