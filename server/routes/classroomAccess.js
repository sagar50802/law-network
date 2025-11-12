// routes/classroomAccess.js
import express from "express";
import crypto from "crypto";
import AccessLink from "../models/AccessLink.js";
import Lecture from "../models/Lecture.js";
import jwt from "jsonwebtoken";

const router = express.Router();

/* -------------------------------------------------- */
/* 🔑 Helper: hash group key                          */
/* -------------------------------------------------- */
function hashGroupKey(key) {
  const secret = process.env.GROUP_KEY_SECRET || "fallback-group-secret";
  return crypto
    .createHash("sha256")
    .update(secret + "::" + String(key))
    .digest("hex");
}

/* -------------------------------------------------- */
/* 🧩 Create link (admin)                             */
/*   Supports minutes or hours + multiple group keys  */
/* -------------------------------------------------- */
router.post("/create-link", async (req, res) => {
  try {
    const {
      lectureId,
      type = "free", // "free" | "paid"
      expiresInHours = 0,
      expiresInMinutes = 0,
      permanent = false,
      groupKeys = [], // [{label:"whatsapp", key:"abcd"}]
    } = req.body;

    // Remove any previous links for this lecture
    await AccessLink.deleteMany({ lectureId });

    // Expiry: store as a plain Date (Mongo will store as UTC internally)
    let expiresAt = null;
    if (!permanent) {
      const totalMs =
        (Number(expiresInHours) * 60 + Number(expiresInMinutes)) *
        60 *
        1000;
      expiresAt = new Date(Date.now() + totalMs);
    }

    // Group key hashes
    const groupKeyHashes = Array.isArray(groupKeys)
      ? groupKeys
          .filter((g) => g && g.key)
          .map((g) => ({
            label: g.label || "group",
            hash: hashGroupKey(g.key),
          }))
      : [];

    const hasKeys = groupKeyHashes.length > 0;

    const token = crypto.randomBytes(16).toString("hex");

    const link = await AccessLink.create({
      token,
      lectureId,
      isFree: type === "free",
      expiresAt,
      expired: false,
      allowedUsers: [],
      visits: 0,
      visitors: [],
      requireGroupKey: type === "paid" && hasKeys,
      groupKeys: hasKeys ? groupKeyHashes : [],
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

/* -------------------------------------------------- */
/* 🔓 Optional auth                                   */
/* -------------------------------------------------- */
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

/* -------------------------------------------------- */
/* ✅ Check link validity                             */
/* -------------------------------------------------- */
router.get("/check", verifyTokenOptional, async (req, res) => {
  try {
    const { token } = req.query;
    if (!token) {
      return res
        .status(400)
        .json({ allowed: false, reason: "missing_token" });
    }

    const link = await AccessLink.findOne({ token });
    if (!link) {
      return res.status(404).json({ allowed: false, reason: "no_link" });
    }

    // Expiry (5s *grace period* AFTER expiry)
    const nowMs = Date.now();
    const expiresAtMs = link.expiresAt
      ? new Date(link.expiresAt).getTime()
      : null;

    if (expiresAtMs && nowMs > expiresAtMs + 5000) {
      await AccessLink.updateOne(
        { token },
        { $set: { expired: true } }
      );
      return res
        .status(403)
        .json({ allowed: false, reason: "expired" });
    }

    // Analytics
    const visitorId = req.user ? req.user.id : req.ip;
    await AccessLink.updateOne(
      { token },
      { $inc: { visits: 1 }, $addToSet: { visitors: visitorId } }
    );

    // Free links: open for everyone
    if (link.isFree) {
      return res.json({
        allowed: true,
        mode: "free",
        expiresAt: link.expiresAt,
      });
    }

    // Paid link: require matching group key only when configured
    if (
      link.requireGroupKey &&
      Array.isArray(link.groupKeys) &&
      link.groupKeys.length > 0
    ) {
      const providedKey =
        req.headers["x-group-key"] ||
        req.cookies?.gk ||
        req.query.key ||
        "";

      const candidate = hashGroupKey(providedKey);
      const ok = link.groupKeys.some((g) => g.hash === candidate);
      if (!ok) {
        return res
          .status(403)
          .json({ allowed: false, reason: "bad_group_key" });
      }
    }

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

/* -------------------------------------------------- */
/* 🎓 Visible lectures for a token                    */
/*   (public + the protected one unlocked by token)   */
/* -------------------------------------------------- */
router.get("/available", async (req, res) => {
  try {
    const { token } = req.query;

    // No token → only public lectures
    if (!token) {
      const publicLectures = await Lecture.find({
        accessType: "public",
      }).lean();

      const normalized = publicLectures.map((l) => ({
        ...l,
        isAllowed: true,
      }));

      console.log("DEBUG /available => public-only", {
        token: null,
        lecturesCount: normalized.length,
      });

      return res.json({ success: true, lectures: normalized });
    }

    const link = await AccessLink.findOne({ token });
    if (!link) {
      console.log("DEBUG /available => invalid_token", { token });
      return res.json({ success: false, reason: "invalid_token" });
    }

    // Expiry (5s grace period)
    const nowMs = Date.now();
    const expiresAtMs = link.expiresAt
      ? new Date(link.expiresAt).getTime()
      : null;

    if (expiresAtMs && nowMs > expiresAtMs + 5000) {
      await AccessLink.updateOne(
        { token },
        { $set: { expired: true } }
      );
      console.log("DEBUG /available => expired", {
        token,
        expiresAt: link.expiresAt,
        now: new Date(nowMs),
      });
      return res.json({ success: false, reason: "expired" });
    }

    // Enforce group key for paid links when configured
    if (
      !link.isFree &&
      link.requireGroupKey &&
      Array.isArray(link.groupKeys) &&
      link.groupKeys.length > 0
    ) {
      const providedKey =
        req.headers["x-group-key"] ||
        req.cookies?.gk ||
        req.query.key ||
        "";

      const candidate = hashGroupKey(providedKey);
      const ok = link.groupKeys.some((g) => g.hash === candidate);
      if (!ok) {
        console.log("DEBUG /available => bad_group_key", {
          token,
          providedKey: !!providedKey,
        });
        return res.json({ success: false, reason: "bad_group_key" });
      }
    }

    // Public lectures (always allowed)
    const publicLectures = await Lecture.find({
      accessType: "public",
    }).lean();
    const normalizedPublic = publicLectures.map((l) => ({
      ...l,
      isAllowed: true,
    }));

    // The lecture unlocked by this link
    let unlocked = null;
    if (link.lectureId) {
      const raw = await Lecture.findById(link.lectureId).lean();
      if (raw) {
        unlocked = {
          ...raw,
          isAllowed: true,
          tempUnlocked: true,
        };
      }
    }

    // Merge (avoid duplicates)
    const map = new Map(
      normalizedPublic.map((l) => [String(l._id), l])
    );
    if (unlocked) {
      map.set(String(unlocked._id), unlocked);
    }

    const combined = Array.from(map.values());

    console.log("DEBUG /available =>", {
      token,
      lecturesCount: combined.length,
      unlockedLectureId: unlocked?._id || null,
      unlockedLectureTitle: unlocked?.title || null,
      requireGroupKey: link.requireGroupKey,
      isFree: link.isFree,
      expiresAt: link.expiresAt,
      now: new Date(nowMs),
    });

    res.json({
      success: true,
      lectures: combined,
      unlockedLectureId: unlocked?._id || null,
      expiresAt: link.expiresAt,
    });
  } catch (err) {
    console.error("Available lectures fetch failed:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/* -------------------------------------------------- */
/* ♻️ Regenerate link (admin)                         */
/* -------------------------------------------------- */
router.post("/regenerate-link", async (req, res) => {
  try {
    const {
      lectureId,
      hours = 0,
      minutes = 5,
      type, // optional: "free"|"paid"
      groupKeys, // optional: replace keys [{label, key}]
    } = req.body;

    const totalMs =
      (Number(hours) * 60 + Number(minutes)) * 60 * 1000;
    const newExpiresAt = new Date(Date.now() + totalMs);
    const newToken = crypto.randomBytes(16).toString("hex");

    let groupKeyHashes;
    if (Array.isArray(groupKeys)) {
      groupKeyHashes = groupKeys
        .filter((g) => g && g.key)
        .map((g) => ({
          label: g.label || "group",
          hash: hashGroupKey(g.key),
        }));
    }

    const hasKeys =
      Array.isArray(groupKeyHashes) && groupKeyHashes.length > 0;

    const update = {
      token: newToken,
      expiresAt: newExpiresAt,
      expired: false,
      $set: { updatedAt: new Date() },
    };

    if (typeof type === "string") {
      update.isFree = type === "free";
    }

    if (Array.isArray(groupKeyHashes)) {
      update.groupKeys = hasKeys ? groupKeyHashes : [];
      update.requireGroupKey = (type || "paid") === "paid" && hasKeys;
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

/* -------------------------------------------------- */
/* ❌ Revoke user (for future use)                    */
/* -------------------------------------------------- */
router.post("/revoke-user", async (req, res) => {
  try {
    const { token, userId } = req.body;
    await AccessLink.updateOne(
      { token },
      { $pull: { allowedUsers: userId } }
    );
    res.json({ success: true });
  } catch (err) {
    console.error("Revoke failed:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
