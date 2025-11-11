import express from "express";
import mongoose from "mongoose";
import { isAdmin } from "./utils.js";

const router = express.Router();

/* ---------------- Model ---------------- */
const Terms =
  mongoose.models.Terms ||
  mongoose.model(
    "Terms",
    new mongoose.Schema(
      {
        text: { type: String, default: "" },
      },
      { timestamps: true }
    )
  );

/* ---------------- GET (public) ---------------- */
router.get("/", async (_req, res) => {
  try {
    const doc = await Terms.findOne().lean();
    res.json({ success: true, terms: doc || null });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/* ---------------- PUT (admin only) ---------------- */
router.put("/", isAdmin, async (req, res) => {
  try {
    const { text = "" } = req.body || {};
    const doc = await Terms.findOneAndUpdate(
      {},
      { text },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();
    res.json({ success: true, terms: doc });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
