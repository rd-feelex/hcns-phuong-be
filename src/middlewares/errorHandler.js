function notFound(req, res) {
  res.status(404).json({ error: 'Không tìm thấy endpoint' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({ error: err.message || 'Lỗi máy chủ' });
}

// Bọc handler async để lỗi rơi vào errorHandler thay vì làm treo request
const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { notFound, errorHandler, asyncHandler };
