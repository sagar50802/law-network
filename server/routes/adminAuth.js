import express from "express";
import crypto from "crypto";
import Admin from "../models/Admin.js";

const router = express.Router();

/* -------------------- Hash Function -------------------- */
function hashPassword(password) {
  return crypto.createHash("sha256").update(password).digest("hex");
}

/* -------------------- Ensure Admin Exists -------------------- */
async function ensureAdmin() {
  let admin = await Admin.findOne({ username: "owner" });

  if (!admin) {
    const hashed = hashPassword(process.env.ADMIN_KEY);
    admin = await Admin.create({
      username: "owner",
      password: hashed,
      token: ""
    });
  }
  return admin;
}

ensureAdmin();

/* -------------------- Login Route -------------------- */
router.post("/login", async (req, res) => {
  const { password } = req.body;
  const admin = await Admin.findOne({ username: "owner" });

  const match = hashPassword(password) === admin.password;
  if (!match) return res.status(401).json({ success: false, message: "Wrong password" });

  const token = crypto.randomBytes(32).toString("hex");
  admin.token = token;
  await admin.save();

  return res.json({ success: true, token });
});

/* -------------------- Change Password Route -------------------- */
router.post("/change-password", async (req, res) => {
  const { token, oldPassword, newPassword } = req.body;
  const admin = await Admin.findOne({ username: "owner" });

  if (admin.token !== token)
    return res.status(403).json({ success: false, message: "Invalid token" });

  const match = hashPassword(oldPassword) === admin.password;
  if (!match)
    return res.status(401).json({ success: false, message: "Old password incorrect" });

  admin.password = hashPassword(newPassword);
  admin.token = "";
  await admin.save();

  return res.json({ success: true, message: "Password updated" });
});

/* -------------------- Middleware -------------------- */
export function requireAdmin(req, res, next) {
  const token = req.headers["x-admin-token"];
  if (!token) return res.status(401).json({ success: false, message: "Missing token" });

  Admin.findOne({ username: "owner" }).then((admin) => {
    if (!admin || admin.token !== token)
      return res.status(403).json({ success: false, message: "Invalid token" });

    next();
  });
}

export default router;
