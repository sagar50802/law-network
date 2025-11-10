// routes/classroomAccess.js
import express from "express";
import crypto from "crypto";
import AccessLink from "../models/AccessLink.js";
import { verifyToken } from "../middleware/auth.js";

const router = express.Router();

/**
 * 🧩 Create link (admin panel will call this)
 */
router.post("/create-link", async (req, res) => {
  try {
    const { lectureId, type = "free", expiresInHours = 24 } = req.body;

    const token = crypto.randomBytes(16).toString("hex");
    const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);

    const link = await AccessLink.create({
      token,
      lectureId,
      isFree: type === "free",
      expiresAt,
    });

    res.json({
      success: true,
      url: `https://law-network-client.onrender.com/classroom/share?token=${link.token}`,
      expiresAt,
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * ✅ Check access when user opens shared link
 */
router.get("/check", verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { token } = req.query;

    const link = await AccessLink.findOne({ token });
    if (!link) return res.status(404).json({ allowed: false, reason: "no_link" });
    if (link.expiresAt <= Date.now())
      return res.status(403).json({ allowed: false, reason: "expired" });

    if (link.isFree) {
      // free link: any logged-in user is okay (or even no login if you want)
      return res.json({ allowed: true, mode: "free" });
    }

    // paid link: user must be in allowedUsers
    const isAllowed = link.allowedUsers.some(
      (id) => id.toString() === userId.toString()
    );
    if (!isAllowed)
      return res.status(403).json({ allowed: false, reason: "not_in_list" });

    return res.json({ allowed: true, mode: "paid" });
  } catch (err) {
    res.status(500).json({ allowed: false, error: err.message });
  }
});

/**
 * ❌ Revoke a user (when you remove from group)
 */
router.post("/revoke-user", async (req, res) => {
  try {
    const { token, userId } = req.body;
    await AccessLink.updateOne(
      { token },
      { $pull: { allowedUsers: userId } }
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
