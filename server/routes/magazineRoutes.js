import express from "express";
import Magazine from "../models/Magazine.js";

const router = express.Router();

/* -------------------------------------------------------------------------- */
/* 1️⃣ CREATE NEW MAGAZINE (Admin Only)                                         */
/* -------------------------------------------------------------------------- */
router.post("/", async (req, res) => {
  try {
    const { title, subtitle, slug, slides } = req.body;

    if (!title || !slug || !slides?.length) {
      return res.status(400).json({ ok: false, error: "Missing fields" });
    }

    // Check if slug exists
    const exists = await Magazine.findOne({ slug });
    if (exists) {
      return res.status(400).json({ ok: false, error: "Slug already exists" });
    }

    const mag = await Magazine.create({
      title,
      subtitle,
      slug,
      slides,
    });

    return res.json({ ok: true, issue: mag });
  } catch (err) {
    console.error("Magazine Create Error:", err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

/* -------------------------------------------------------------------------- */
/* 2️⃣ UPDATE MAGAZINE                                                            */
/* -------------------------------------------------------------------------- */
router.put("/:id", async (req, res) => {
  try {
    const { title, subtitle, slug, slides } = req.body;

    const mag = await Magazine.findById(req.params.id);
    if (!mag) return res.status(404).json({ ok: false, error: "Not found" });

    mag.title = title;
    mag.subtitle = subtitle;
    mag.slug = slug;
    mag.slides = slides;

    await mag.save();

    return res.json({ ok: true, issue: mag });
  } catch (err) {
    console.error("Magazine Update Error:", err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

/* -------------------------------------------------------------------------- */
/* 3️⃣ DELETE MAGAZINE (Admin Only)                                              */
/* -------------------------------------------------------------------------- */
router.delete("/:id", async (req, res) => {
  try {
    const mag = await Magazine.findById(req.params.id);
    if (!mag) {
      return res.status(404).json({ ok: false, error: "Magazine not found" });
    }

    await mag.deleteOne();

    return res.json({ ok: true, message: "Magazine deleted successfully" });
  } catch (err) {
    console.error("Magazine Delete Error:", err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

/* -------------------------------------------------------------------------- */
/* 4️⃣ GET ALL MAGAZINES (List View)                                             */
/* -------------------------------------------------------------------------- */
router.get("/", async (req, res) => {
  try {
    const list = await Magazine.find()
      .sort({ createdAt: -1 })
      .select("title subtitle slug createdAt");

    res.json({ ok: true, issues: list });
  } catch (err) {
    console.error("Magazine List Error:", err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

/* -------------------------------------------------------------------------- */
/* 5️⃣ GET A SINGLE MAGAZINE BY SLUG (Reader)                                    */
/* -------------------------------------------------------------------------- */
router.get("/:slug", async (req, res) => {
  try {
    const issue = await Magazine.findOne({ slug: req.params.slug });

    if (!issue) {
      return res.status(404).json({ ok: false, error: "Issue not found" });
    }

    res.json({ ok: true, issue });
  } catch (err) {
    console.error("Magazine Get Error:", err);
    res.status(500).json({ ok: false, error: "Server error" });
  }
});

export default router;
