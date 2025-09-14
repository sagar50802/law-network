const express = require("express");
const { grantAccess, revokeAccess, checkAccess } = require("../controllers/access");

const router = express.Router();

// POST /api/access/grant
router.post("/grant", async (req, res) => {
  try {
    await grantAccess(req, res);
  } catch (err) {
    console.error("grantAccess error:", err);
    res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

// POST /api/access/revoke
router.post("/revoke", async (req, res) => {
  try {
    await revokeAccess(req, res);
  } catch (err) {
    console.error("revokeAccess error:", err);
    res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

// GET /api/access/check
router.get("/check", async (req, res) => {
  try {
    await checkAccess(req, res);
  } catch (err) {
    console.error("checkAccess error:", err);
    res.status(500).json({ ok: false, error: "Internal Server Error" });
  }
});

module.exports = router;
