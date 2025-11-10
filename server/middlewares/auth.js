// server/middlewares/auth.js
import jwt from "jsonwebtoken";

/**
 * ✅ verifyToken middleware
 * Verifies Bearer token sent from frontend (localStorage authToken)
 * and attaches decoded user to req.user.
 */
export function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ allowed: false, message: "No token provided" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const secret = process.env.JWT_SECRET || "super-secret-key";
    const decoded = jwt.verify(token, secret);
    req.user = decoded;
    next();
  } catch (err) {
    console.error("Token verification failed:", err.message);
    return res.status(403).json({ allowed: false, message: "Invalid or expired token" });
  }
}
