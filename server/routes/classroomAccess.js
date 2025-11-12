import express from "express";
import crypto from "crypto";
import AccessLink from "../models/AccessLink.js";
import jwt from "jsonwebtoken";

const router = express.Router();

/* --------------------------------------------------
   🧩 Create new classroom share link (called by admin)
-------------------------------------------------- */
router.post("/create-link", async (req, res) => {
  try {
    const {
      lectureId,
      type = "free",
      expiresInHours = 0,
      expiresInMinutes = 0, // ✅ New support
      permanent = false,
    } = req.body;

    // 🧹 Clean any previous link for same lecture
    await AccessLink.deleteMany({ lectureId });

    // 🕒 Expiry logic (supports minutes or hours)
    let expiresAt = null;
    if (!permanent) {
      const totalMs =
        (Number(expiresInHours) * 60 + Number(expiresInMinutes)) * 60 * 1000;
      expiresAt = new Date(Date.now() + totalMs);
    }

    // ✅ Normalize to UTC
    const expiresUtc = expiresAt ? new Date(expiresAt.toISOString()) : null;

    const token = crypto.randomBytes(16).toString("hex");
    const link = await AccessLink.create({
      token,
      lectureId,
      isFree: type === "free",
      expiresAt: expiresUtc,
      expired: false,
      allowedUsers: [],
      visits: 0,
      visitors: [],
    });

    res.json({
      success: true,
      url: `https://law-network-client.onrender.com/classroom/share?token=${link.token}`,
      expiresAt: expiresUtc,
    });
  } catch (err) {
    console.error("Create link failed:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/* --------------------------------------------------
   🔓 Middleware: optional token check (for guests)
-------------------------------------------------- */
function verifyTokenOptional(req, _res, next) {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.split(" ")[1];
    try {
      const secret = process.env.JWT_SECRET || "super-secret-key";
      req.user = jwt.verify(token, secret);
    } catch {
      req.user = null;
    }
  } else {
    req.user = null;
  }
  next();
}

/* --------------------------------------------------
   ✅ Check link validity when user opens classroom
-------------------------------------------------- */
router.get("/check", verifyTokenOptional, async (req, res) => {
  try {
    const { token } = req.query;
    if (!token)
      return res.status(400).json({ allowed: false, reason: "missing_token" });

    const link = await AccessLink.findOne({ token });
    if (!link)
      return res.status(404).json({ allowed: false, reason: "no_link" });

    // 🕒 Expiry check with 5s tolerance
    const now = Date.now();
    const expiresAt = link.expiresAt ? new Date(link.expiresAt).getTime() : null;

    console.log("🔍 Expiry debug:", {
      now: new Date(now).toISOString(),
      expiresAt: link.expiresAt,
      diffMs: expiresAt ? expiresAt - now : "∞",
    });

    if (expiresAt && expiresAt < now - 5000) {
      await AccessLink.updateOne({ token }, { $set: { expired: true } });
      return res.status(403).json({ allowed: false, reason: "expired" });
    }

    // 🧮 Track analytics
    const visitorId = req.user ? req.user.id : req.ip;
    await AccessLink.updateOne(
      { token },
      {
        $inc: { visits: 1 },
        $addToSet: { visitors: visitorId },
      }
    );

    // ✅ Free links: open to everyone
    if (link.isFree) {
      return res.json({
        allowed: true,
        mode: "free",
        expiresAt: link.expiresAt,
      });
    }

    // 🔐 Paid link: must be logged in
    if (!req.user)
      return res
        .status(401)
        .json({ allowed: false, reason: "no_user", message: "Please log in." });

    const userId = req.user.id;
    const isAllowed =
      Array.isArray(link.allowedUsers) &&
      link.allowedUsers.some((id) => id.toString() === userId.toString());

    if (!isAllowed)
      return res.status(403).json({ allowed: false, reason: "not_in_list" });

    // ✅ Allow access
    return res.json({
      allowed: true,
      mode: "paid",
      expiresAt: link.expiresAt,
    });
  } catch (err) {
    console.error("Check link failed:", err);
    res.status(500).json({ allowed: false, error: err.message });
  }
});

/* --------------------------------------------------
   ♻️ Admin: Regenerate a new share link for same lecture
-------------------------------------------------- */
router.post("/regenerate-link", async (req, res) => {
  try {
    const { lectureId, hours = 1, minutes = 0, type = "paid" } = req.body;

    // 🧹 Expire old links
    await AccessLink.updateMany({ lectureId }, { $set: { expired: true } });

    const totalMs = (hours * 60 + minutes) * 60 * 1000;
    const newExpiresAt = new Date(Date.now() + totalMs);
    const expiresUtc = new Date(newExpiresAt.toISOString());

    const newToken = crypto.randomBytes(16).toString("hex");

    const updated = await AccessLink.findOneAndUpdate(
      { lectureId },
      {
        token: newToken,
        expiresAt: expiresUtc,
        expired: false,
        isFree: type === "free",
        $set: { updatedAt: new Date() },
      },
      { new: true, upsert: true }
    );

    res.json({
      success: true,
      url: `https://law-network-client.onrender.com/classroom/share?token=${updated.token}`,
      expiresAt: updated.expiresAt,
    });
  } catch (err) {
    console.error("Regenerate link failed:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/* --------------------------------------------------
   ❌ Revoke user from paid classroom link
-------------------------------------------------- */
router.post("/revoke-user", async (req, res) => {
  try {
    const { token, userId } = req.body;
    await AccessLink.updateOne({ token }, { $pull: { allowedUsers: userId } });
    res.json({ success: true });
  } catch (err) {
    console.error("Revoke failed:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
