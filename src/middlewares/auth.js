const authService = require('../services/auth.service');
const { asyncHandler } = require('./errorHandler');

// Yêu cầu đăng nhập: Bearer token hợp lệ (JWT verify cục bộ, không gọi mạng)
const requireAuth = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Chưa đăng nhập' });
  const user = authService.verify(token);
  if (!user) return res.status(401).json({ error: 'Phiên đăng nhập hết hạn' });
  req.user = user;
  next();
});

// Chỉ quản trị viên
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Chỉ quản trị viên mới có quyền này' });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
