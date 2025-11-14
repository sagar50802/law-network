export default function catchAsync(fn) {
  return function (req, res, next) {
    Promise.resolve(fn(req, res, next)).catch((err) => {
      console.error("API ERROR:", err);
      res.status(500).json({ ok: false, error: err.message });
    });
  };
}
