module.exports = function ownerCheck(req, res, next) {
  const key = req.headers["x-owner-key"];

  if (!key || key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  next();
};
