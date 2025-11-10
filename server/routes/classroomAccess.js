import express from "express";
import crypto from "crypto";
import AccessLink from "../models/AccessLink.js";
import jwt from "jsonwebtoken"; // ✅ needed for optional token decoding

const router = express.Router();

/* --------------------------------------------------
   🧩 Create new classroom share link (called by admin)
-------------------------------------------------- */
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
      req.user = null; // invalid token, treat as guest
    }
  } else {
    req.user = null; // no token, guest user
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

    if (new Date(link.expiresAt) < new Date())
      return res.status(403).json({ allowed: false, reason: "expired" });

    // ✅ Free link: anyone can access (even guests)
    if (link.isFree) {
      return res.json({ allowed: true, mode: "free" });
    }

    // 🔐 Paid link: must be logged in + in allowedUsers
    if (!req.user)
      return res.status(401).json({ allowed: false, reason: "no_user" });

    const userId = req.user.id;
    const isAllowed = link.allowedUsers.some(
      (id) => id.toString() === userId.toString()
    );

    if (!isAllowed)
      return res.status(403).json({ allowed: false, reason: "not_in_list" });

    return res.json({ allowed: true, mode: "paid" });
  } catch (err) {
    console.error("Check link failed:", err);
    res.status(500).json({ allowed: false, error: err.message });
  }
});

/* --------------------------------------------------
   ❌ Revoke a user from a paid classroom link
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
