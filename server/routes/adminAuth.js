import express from "express";
import bcrypt from "bcrypt";
import crypto from "crypto";
import Admin from "../models/Admin.js";

const router = express.Router();

/* -------------------- Ensure Admin Exists -------------------- */
async function ensureAdmin() {
  let admin = await Admin.findOne({ username: "owner" });

  // If no admin exists, create one using ADMIN_KEY from environment
  if (!admin) {
    const hashed = await bcrypt.hash(process.env.ADMIN_KEY, 10);
    admin = await Admin.create({
      username: "owner",
      password: hashed,
      token: ""
    });
  }

  return admin;
}

// Run on startup
ensureAdmin();

/* -------------------- Login Route -------------------- */
router.post("/login", async (req, res) => {
  const { password } = req.body;

  const admin = await Admin.findOne({ username: "owner" });
  if (!admin) return res.status(500).json({ success: false, message: "Admin not found" });

  const match = await bcrypt.compare(password, admin.password);
  if (!match)
    return res.status(401).json({ success: false, message: "Wrong password" });

  // Create secure token
  const token = crypto.randomBytes(32).toString("hex");

  admin.token = token;
  await admin.save();

  return res.json({ success: true, token });
});

/* -------------------- Change Password Route -------------------- */
router.post("/change-password", async (req, res) => {
  const { token, oldPassword, newPassword } = req.body;

  const admin = await Admin.findOne({ username: "owner" });
  if (!admin) return res.status(500).json({ success: false, message: "Admin not found" });

  // Validate token
  if (admin.token !== token)
    return res.status(403).json({ success: false, message: "Invalid token" });

  // Validate old password
  const match = await bcrypt.compare(oldPassword, admin.password);
  if (!match)
    return res.status(401).json({ success: false, message: "Old password incorrect" });

  // Save new password
  const hashed = await bcrypt.hash(newPassword, 10);
  admin.password = hashed;
  admin.token = ""; // logout all sessions
  await admin.save();

  return res.json({ success: true, message: "Password updated successfully" });
});

/* -------------------- Middleware For Protected Routes -------------------- */
export function requireAdmin(req, res, next) {
  const token = req.headers["x-admin-token"];

  if (!token)
    return res.status(401).json({ success: false, message: "Missing token" });

  Admin.findOne({ username: "owner" }).then((admin) => {
    if (!admin || admin.token !== token)
      return res.status(403).json({ success: false, message: "Invalid token" });

    next();
  });
}

export default router;
