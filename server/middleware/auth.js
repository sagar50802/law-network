import jwt from "jsonwebtoken";

/**
 * ✅ verifyToken middleware (guest-friendly)
 * - If Bearer token exists → verifies & sets req.user
 * - If no token → continues as guest (req.user = null)
 * - Use with routes that can handle both paid/free links
 */
export function verifyToken(req, res, next) {
  const authHeader = req.headers.authorization;

  // 🟡 No token → allow guest access
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    req.user = null;
    return next();
  }

  const token = authHeader.split(" ")[1];

  try {
    const secret = process.env.JWT_SECRET || "super-secret-key";
    const decoded = jwt.verify(token, secret);
    req.user = decoded;
    next();
  } catch (err) {
    console.error("Token verification failed:", err.message);
    // token invalid → treat as guest, don’t hard-block
    req.user = null;
    next();
  }
}
