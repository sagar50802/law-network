import express from "express";
import crypto from "crypto";
import AccessLink from "../models/AccessLink.js";
import jwt from "jsonwebtoken";

const router = express.Router();

/* --------------------------------------------------
   ⚙️ Secret used to generate groupKey (per group basis)
   👉 Change this string per platform if needed
-------------------------------------------------- */
const GROUP_SECRET = process.env.GROUP_SECRET || "whatsapp-group-law-network";

/* --------------------------------------------------
   🧩 Create new classroom share link (called by admin)
-------------------------------------------------- */
router.post("/create-link", async (req, res) => {
  try {
    const {
      lectureId,
      type = "free",
      expiresInHours = 0,
      expiresInMinutes = 0,
      permanent = false,
      group = "whatsapp", // optional field (future use)
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

    const expiresUtc = expiresAt ? new Date(expiresAt.toISOString()) : null;

    const token = crypto.randomBytes(16).toString("hex");

    // 🔑 Generate short group key (tied to platform)
    const groupKey = crypto
      .createHash("sha256")
      .update(GROUP_SECRET + group)
      .digest("hex")
      .substring(0, 8);

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
      url: `https://law-network-client.onrender.com/classroom/share?token=${link.token}&key=${groupKey}`,
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
    const { token, key } = req.query;

    if (!token)
      return res.status(400).json({ allowed: false, reason: "missing_token" });

    const link = await AccessLink.findOne({ token });
    if (!link)
      return res.status(404).json({ allowed: false, reason: "no_link" });

    // 🕒 Expiry check with 5s tolerance
    const now = Date.now();
    const expiresAt = link.expiresAt ? new Date(link.expiresAt).getTime() : null;

    if (expiresAt && expiresAt < now - 5000) {
      await AccessLink.updateOne({ token }, { $set: { expired: true } });
      return res.status(403).json({ allowed: false, reason: "expired" });
    }

    // 🔐 Group key verification
    const validKey = crypto
      .createHash("sha256")
      .update(GROUP_SECRET + "whatsapp") // if you later add telegram, adjust here
      .digest("hex")
      .substring(0, 8);

    if (key !== validKey) {
      console.warn("❌ Invalid or missing group key attempt", { token, key });
      return res.status(403).json({
        allowed: false,
        reason: "invalid_group_key",
        message: "🚫 Unauthorized — this link is for group members only.",
      });
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

    // 🔐 Paid link: group key validated → allow access
    return res.json({
      allowed: true,
      mode: "paid-group",
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

    // Recreate valid groupKey
    const groupKey = crypto
      .createHash("sha256")
      .update(GROUP_SECRET + "whatsapp")
      .digest("hex")
      .substring(0, 8);

    res.json({
      success: true,
      url: `https://law-network-client.onrender.com/classroom/share?token=${updated.token}&key=${groupKey}`,
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
