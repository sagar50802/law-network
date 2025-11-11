// server/routes/terms.js
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
    console.error("GET /terms error:", err);
    res
      .status(500)
      .json({ success: false, error: "Failed to fetch terms." });
  }
});

/* ---------------- PUT (admin only) ---------------- */
router.put("/", isAdmin, async (req, res) => {
  try {
    const { text = "" } = req.body || {};
    const doc = await Terms.findOneAndUpdate(
      {},
      { text: String(text) },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ).lean();
    res.json({ success: true, terms: doc });
  } catch (err) {
    console.error("PUT /terms error:", err);
    res
      .status(500)
      .json({ success: false, error: "Failed to update terms." });
  }
});

export default router;
