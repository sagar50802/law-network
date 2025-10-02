// server/routes/utils.js
/** Admin guard – accepts X-Owner-Key or Authorization: Bearer <key> */
export function isAdmin(req, res, next) {
  try {
    const xo = req.headers['x-owner-key'] || req.headers['x-ownerkey'] || '';
    const auth = req.headers['authorization'] || '';
    const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const token = xo || bearer;

    // ✅ Look for ADMIN_KEY first, else fall back to VITE_OWNER_KEY, else default
    const EXPECTED = String(
      process.env.ADMIN_KEY || process.env.VITE_OWNER_KEY || 'LAWNOWNER2025'
    );

    if (token && token === EXPECTED) return next();
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  } catch (e) {
    console.error('isAdmin error:', e);
    return res.status(500).json({ success: false, error: 'Auth error' });
  }
}
