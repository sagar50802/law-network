import express from "express";
import Magazine from "../models/Magazine.js";

const router = express.Router();

/* ============================================================
   ALWAYS RESPOND JSON — NEVER HTML
============================================================ */
function sendServerError(res, err) {
  console.error(err);
  return res.status(500).json({ ok: false, error: "Server error" });
}

/* ============================================================
   1) GET ALL MAGAZINES   ( /api/magazines )
============================================================ */
router.get("/", async (req, res) => {
  try {
    const list = await Magazine.find()
      .sort({ createdAt: -1 })
      .select("title subtitle slug createdAt");

    return res.json({ ok: true, issues: list });
  } catch (err) {
    return sendServerError(res, err);
  }
});

/* ============================================================
   2) GET MAGAZINE BY SLUG   ( /api/magazines/slug/:slug )
============================================================ */
router.get("/slug/:slug", async (req, res) => {
  try {
    const issue = await Magazine.findOne({ slug: req.params.slug });

    if (!issue) {
      return res.status(404).json({ ok: false, error: "Issue not found" });
    }

    return res.json({ ok: true, issue });
  } catch (err) {
    return sendServerError(res, err);
  }
});

/* ============================================================
   3) CREATE MAGAZINE   ( POST /api/magazines )
============================================================ */
router.post("/", async (req, res) => {
  try {
    const { title, subtitle, slug, slides } = req.body;

    if (!title || !slug || !slides?.length) {
      return res.status(400).json({ ok: false, error: "Missing fields" });
    }

    const exists = await Magazine.findOne({ slug });
    if (exists) {
      return res
        .status(400)
        .json({ ok: false, error: "Slug already exists" });
    }

    const created = await Magazine.create({
      title,
      subtitle,
      slug,
      slides,
    });

    return res.json({ ok: true, issue: created });
  } catch (err) {
    return sendServerError(res, err);
  }
});

/* ============================================================
   4) UPDATE MAGAZINE   ( PUT /api/magazines/:id )
============================================================ */
router.put("/:id", async (req, res) => {
  try {
    const { title, subtitle, slug, slides } = req.body;

    const mag = await Magazine.findById(req.params.id);
    if (!mag) {
      return res
        .status(404)
        .json({ ok: false, error: "Magazine not found" });
    }

    mag.title = title;
    mag.subtitle = subtitle;
    mag.slug = slug;
    mag.slides = slides;

    await mag.save();

    return res.json({ ok: true, issue: mag });
  } catch (err) {
    return sendServerError(res, err);
  }
});

/* ============================================================
   5) DELETE MAGAZINE   ( DELETE /api/magazines/:id )
============================================================ */
router.delete("/:id", async (req, res) => {
  try {
    const mag = await Magazine.findById(req.params.id);
    if (!mag) {
      return res
        .status(404)
        .json({ ok: false, error: "Magazine not found" });
    }

    await mag.deleteOne();

    return res.json({ ok: true, message: "Magazine deleted successfully" });
  } catch (err) {
    return sendServerError(res, err);
  }
});

export default router;
