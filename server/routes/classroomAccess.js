import express from "express";
import crypto from "crypto";
import AccessLink from "../models/AccessLink.js";
import Lecture from "../models/Lecture.js"; // ✅ NEW
import jwt from "jsonwebtoken";

const router = express.Router();

function hashGroupKey(key) {
  const secret = process.env.GROUP_KEY_SECRET || "fallback-group-secret";
  return crypto.createHash("sha256").update(secret + "::" + String(key)).digest("hex");
}

/* --------------------------------------------------
   🧩 Create link (admin)
   Supports minutes or hours + multiple group keys
-------------------------------------------------- */
router.post("/create-link", async (req, res) => {
  try {
    const {
      lectureId,
      type = "free",           // "free" | "paid"
      expiresInHours = 0,
      expiresInMinutes = 0,
      permanent = false,
      groupKeys = [],          // [{label: "whatsapp", key: "abcd"}, {label:"telegram", key:"efgh"}]
    } = req.body;

    // clean previous link(s) for this lecture
    await AccessLink.deleteMany({ lectureId });

    // expiry
    let expiresAt = null;
    if (!permanent) {
      const totalMs = (Number(expiresInHours) * 60 + Number(expiresInMinutes)) * 60 * 1000;
      expiresAt = new Date(Date.now() + totalMs);
    }
    const expiresUtc = expiresAt ? new Date(expiresAt.toISOString()) : null;

    // group key hashes
    const groupKeyHashes = Array.isArray(groupKeys)
      ? groupKeys
          .filter(g => g && g.key)
          .map(g => ({ label: g.label || "group", hash: hashGroupKey(g.key) }))
      : [];

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
      requireGroupKey: type === "paid" && groupKeyHashes.length > 0, // ✅ require key for paid links
      groupKeys: groupKeyHashes, // [{label, hash}]
    });

    res.json({
      success: true,
      url: `https://law-network-client.onrender.com/classroom/share?token=${link.token}`, // clean URL (no key)
      expiresAt: expiresUtc,
    });
  } catch (err) {
    console.error("Create link failed:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/* --------------------------------------------------
   🔓 Optional auth (kept as-is)
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
   ✅ Check link validity
   Accepts hidden group key via header/cookie/query
-------------------------------------------------- */
router.get("/check", verifyTokenOptional, async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) return res.status(400).json({ allowed: false, reason: "missing_token" });

    const link = await AccessLink.findOne({ token });
    if (!link) return res.status(404).json({ allowed: false, reason: "no_link" });

    // expiry (5s tolerance)
    const now = Date.now();
    const expiresAt = link.expiresAt ? new Date(link.expiresAt).getTime() : null;
    if (expiresAt && expiresAt < now - 5000) {
      await AccessLink.updateOne({ token }, { $set: { expired: true } });
      return res.status(403).json({ allowed: false, reason: "expired" });
    }

    // analytics
    const visitorId = req.user ? req.user.id : req.ip;
    await AccessLink.updateOne(
      { token },
      { $inc: { visits: 1 }, $addToSet: { visitors: visitorId } }
    );

    // free links: open
    if (link.isFree) {
      return res.json({ allowed: true, mode: "free", expiresAt: link.expiresAt });
    }

    // 🔐 Paid link:
    // 1) If link has group keys, require a matching key (hidden)
    if (link.requireGroupKey && Array.isArray(link.groupKeys) && link.groupKeys.length > 0) {
      // preferred: custom header
      const providedKey =
        req.headers["x-group-key"] ||
        req.cookies?.gk ||           // optional cookie
        req.query.key || "";         // fallback query (won't be used in the clean flow)

      const candidate = hashGroupKey(providedKey);
      const ok = link.groupKeys.some(g => g.hash === candidate);
      if (!ok) {
        return res.status(403).json({ allowed: false, reason: "bad_group_key" });
      }
    }

    // 2) (Optional future) If you later add user-based allowlists, you can check here.
    // For now, group key is the gate.

    return res.json({ allowed: true, mode: "paid", expiresAt: link.expiresAt });
  } catch (err) {
    console.error("Check link failed:", err);
    res.status(500).json({ allowed: false, error: err.message });
  }
});

/* --------------------------------------------------
   🎓 NEW: return lectures visible for a token
   (public + the protected one unlocked by this token)
-------------------------------------------------- */
router.get("/available", async (req, res) => {
  try {
    const { token } = req.query;

    // If no token → only public lectures
    if (!token) {
      const publicLectures = await Lecture.find({ accessType: "public" });
      return res.json({ success: true, lectures: publicLectures });
    }

    const link = await AccessLink.findOne({ token });
    if (!link) return res.json({ success: false, reason: "invalid_token" });

    // Expiry (5s tolerance)
    const now = Date.now();
    const expiresAt = link.expiresAt ? new Date(link.expiresAt).getTime() : null;
    if (expiresAt && expiresAt < now - 5000) {
      await AccessLink.updateOne({ token }, { $set: { expired: true } });
      return res.json({ success: false, reason: "expired" });
    }

    // If paid and requires group key, enforce it here too
    if (!link.isFree && link.requireGroupKey && Array.isArray(link.groupKeys) && link.groupKeys.length > 0) {
      const providedKey =
        req.headers["x-group-key"] ||
        req.cookies?.gk ||
        req.query.key || "";

      const candidate = hashGroupKey(providedKey);
      const ok = link.groupKeys.some(g => g.hash === candidate);
      if (!ok) {
        return res.json({ success: false, reason: "bad_group_key" });
      }
    }

    // Public lectures
    const publicLectures = await Lecture.find({ accessType: "public" });

    // The lecture unlocked by this link
    const unlocked = await Lecture.findById(link.lectureId);

    // Merge (avoid duplicates)
    const map = new Map(publicLectures.map(l => [String(l._id), l]));
    if (unlocked) map.set(String(unlocked._id), unlocked);

    const combined = Array.from(map.values());

    res.json({
      success: true,
      lectures: combined,
      unlockedLectureId: unlocked?._id,
      expiresAt: link.expiresAt,
    });
  } catch (err) {
    console.error("Available lectures fetch failed:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/* --------------------------------------------------
   ♻️ Regenerate link (admin)
   Keeps existing group keys unless replaced
-------------------------------------------------- */
router.post("/regenerate-link", async (req, res) => {
  try {
    const {
      lectureId,
      hours = 0,
      minutes = 5,
      type,             // optional: "free"|"paid" to flip behavior
      groupKeys,        // optional: replace keys [{label, key}]
    } = req.body;

    const totalMs = (Number(hours) * 60 + Number(minutes)) * 60 * 1000;
    const newExpiresAt = new Date(Date.now() + totalMs);
    const expiresUtc = new Date(newExpiresAt.toISOString());
    const newToken = crypto.randomBytes(16).toString("hex");

    let groupKeyHashes;
    if (Array.isArray(groupKeys)) {
      groupKeyHashes = groupKeys
        .filter(g => g && g.key)
        .map(g => ({ label: g.label || "group", hash: hashGroupKey(g.key) }));
    }

    const update = {
      token: newToken,
      expiresAt: expiresUtc,
      expired: false,
      $set: { updatedAt: new Date() },
    };

    if (typeof type === "string") {
      update.isFree = type === "free";
    }

    if (groupKeyHashes) {
      update.groupKeys = groupKeyHashes;
      update.requireGroupKey = (type || "paid") === "paid" && groupKeyHashes.length > 0;
    }

    const updated = await AccessLink.findOneAndUpdate(
      { lectureId },
      update,
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
   ❌ Revoke user (kept for future)
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
