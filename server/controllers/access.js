// server/controllers/access.js

/**
 * Access Controller
 * Routes:
 *  - POST /api/access/grant   -> grantAccess (admin-only)
 *  - POST /api/access/revoke  -> revokeAccess (admin-only)
 *  - GET  /api/access/check   -> checkAccess  (public; requires gmail + context)
 */

const AccessGrant = require("../models/AccessGrant");

// --------------------- helpers ---------------------

const trim = (v) => (typeof v === "string" ? v.trim() : v);
const lc = (v) => (typeof v === "string" ? v.toLowerCase() : v);

const pick = (obj, keys) =>
  keys.reduce((acc, k) => {
    if (Object.prototype.hasOwnProperty.call(obj || {}, k)) acc[k] = obj[k];
    return acc;
  }, {});

const ensureOwner = (req) => {
  const headerKey = String(req.headers["x-owner-key"] || "");
  const ownerKey = String(process.env.OWNER_KEY || "");
  return Boolean(req.isOwner || (ownerKey && headerKey === ownerKey));
};

const normalizePlanKey = (k = "") => {
  const key = lc(k || "");
  if (["weekly", "week", "7", "7d"].includes(key)) return "weekly";
  if (["monthly", "month", "30", "30d"].includes(key)) return "monthly";
  if (["yearly", "year", "365", "365d"].includes(key)) return "yearly";
  return key || "weekly";
};

const planKeyToDays = (planKey) => {
  switch (normalizePlanKey(planKey)) {
    case "weekly":
      return 7;
    case "monthly":
      return 30;
    case "yearly":
      return 365; // ✅ fixed: full year, not 90 days
    default:
      return 7;
  }
};

// Build a stable key from provided context.
const buildContextKey = (args = {}) => {
  const explicit = trim(args.contextKey || "");
  if (explicit) return explicit;

  const moduleKey = lc(trim(args.module || "")) || "_";
  const subject = lc(trim(args.subject || "")) || "_";
  const playlist = lc(trim(args.playlist || "")) || "_";
  const itemId = lc(trim(args.itemId || "")) || "_";

  return `m:${moduleKey}|s:${subject}|p:${playlist}|i:${itemId}`;
};

const contextFilter = (args = {}) => {
  const key = buildContextKey(args);
  return { contextKey: key };
};

const cleanupExpiredInternal = async () => {
  const now = new Date();
  try {
    await AccessGrant.deleteMany({
      $or: [
        { expireAt: { $lte: now } },
        { revoked: true, expireAt: { $lte: now } },
      ],
    });
  } catch (e) {
    console.error("access.cleanupExpiredInternal error:", e);
  }
};

const computeExpireAt = ({ expiresAt, durationDays, planKey }) => {
  if (expiresAt) {
    const exp = new Date(expiresAt);
    if (!isNaN(exp.getTime())) return exp;
  }
  const days =
    parseInt(durationDays, 10) || planKeyToDays(planKey || "weekly");
  return new Date(Date.now() + days * 24 * 60 * 60 * 1000);
};

// --------------------- controllers ---------------------

// POST /api/access/grant
async function grantAccess(req, res) {
  try {
    if (!ensureOwner(req)) {
      return res.status(403).json({ ok: false, error: "Forbidden" });
    }

    const body = pick(req.body || {}, [
      "gmail",
      "contextKey",
      "module",
      "subject",
      "playlist",
      "itemId",
      "planKey",
      "durationDays",
      "expiresAt",
      "adminNote",
    ]);

    const gmail = lc(trim(body.gmail || ""));
    if (!gmail) {
      return res
        .status(400)
        .json({ ok: false, error: "Field 'gmail' is required." });
    }

    const key = buildContextKey(body);
    if (!key) {
      return res
        .status(400)
        .json({ ok: false, error: "Context is required." });
    }

    const planKey = normalizePlanKey(body.planKey || "weekly");
    const expireAt = computeExpireAt({
      expiresAt: body.expiresAt,
      durationDays: body.durationDays,
      planKey,
    });

    if (!(expireAt instanceof Date) || isNaN(expireAt.getTime())) {
      return res
        .status(400)
        .json({ ok: false, error: "Invalid expiry configuration." });
    }

    const update = {
      gmail,
      contextKey: key,
      module: trim(body.module || ""),
      subject: trim(body.subject || ""),
      playlist: trim(body.playlist || ""),
      itemId: trim(body.itemId || ""),
      planKey,
      grantedAt: new Date(),
      expireAt,
      revoked: false,
      revokedAt: null,
      adminNote: trim(body.adminNote || ""),
      updatedAt: new Date(),
    };

    const doc = await AccessGrant.findOneAndUpdate(
      { gmail, contextKey: key },
      { $set: update },
      { new: true, upsert: true }
    ).lean();

    cleanupExpiredInternal();

    return res.status(200).json({ ok: true, data: doc });
  } catch (err) {
    console.error("grantAccess error:", err);
    return res
      .status(500)
      .json({ ok: false, error: "Failed to grant access." });
  }
}

// POST /api/access/revoke
async function revokeAccess(req, res) {
  try {
    if (!ensureOwner(req)) {
      return res.status(403).json({ ok: false, error: "Forbidden" });
    }

    const body = pick(req.body || {}, [
      "gmail",
      "contextKey",
      "module",
      "subject",
      "playlist",
      "itemId",
      "adminNote",
    ]);

    const gmail = lc(trim(body.gmail || ""));
    if (!gmail) {
      return res
        .status(400)
        .json({ ok: false, error: "Field 'gmail' is required." });
    }

    const filter = { gmail, ...contextFilter(body) };

    const doc = await AccessGrant.findOneAndUpdate(
      filter,
      {
        $set: {
          revoked: true,
          revokedAt: new Date(),
          adminNote: trim(body.adminNote || ""),
          updatedAt: new Date(),
          expireAt: new Date(), // force expire immediately
        },
      },
      { new: true }
    ).lean();

    if (!doc) {
      return res.status(404).json({ ok: false, error: "Grant not found." });
    }

    cleanupExpiredInternal();

    return res.status(200).json({ ok: true, data: doc });
  } catch (err) {
    console.error("revokeAccess error:", err);
    return res
      .status(500)
      .json({ ok: false, error: "Failed to revoke access." });
  }
}

// GET /api/access/check
async function checkAccess(req, res) {
  try {
    cleanupExpiredInternal();

    const q = pick(req.query || {}, [
      "gmail",
      "contextKey",
      "module",
      "subject",
      "playlist",
      "itemId",
    ]);

    const gmail = lc(trim(q.gmail || ""));
    if (!gmail) {
      return res
        .status(400)
        .json({ ok: false, error: "Query 'gmail' is required." });
    }

    const filter = {
      gmail,
      ...contextFilter(q),
      revoked: { $ne: true },
    };

    const now = new Date();

    const grant = await AccessGrant.findOne(filter)
      .sort({ expireAt: -1 })
      .lean();

    if (!grant) {
      return res.status(200).json({
        ok: true,
        data: { allowed: false, reason: "NO_GRANT" },
      });
    }

    if (!grant.expireAt || grant.expireAt <= now) {
      return res.status(200).json({
        ok: true,
        data: {
          allowed: false,
          reason: "EXPIRED",
          expireAt: grant.expireAt || null,
        },
      });
    }

    const msLeft = grant.expireAt.getTime() - now.getTime();
    const secondsLeft = Math.max(Math.floor(msLeft / 1000), 0);

    return res.status(200).json({
      ok: true,
      data: {
        allowed: true,
        contextKey: grant.contextKey,
        planKey: grant.planKey || null,
        expireAt: grant.expireAt,
        secondsLeft,
        msLeft,
      },
    });
  } catch (err) {
    console.error("checkAccess error:", err);
    return res
      .status(500)
      .json({ ok: false, error: "Failed to check access." });
  }
}

module.exports = {
  grantAccess,
  revokeAccess,
  checkAccess,
};
