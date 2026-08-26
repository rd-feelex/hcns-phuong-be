const service = require('../services/auth.service');
const { asyncHandler } = require('../middlewares/errorHandler');

const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Thiếu email hoặc mật khẩu' });
  res.json(await service.login(email, password));
});

const me = asyncHandler(async (req, res) => {
  res.json(req.user);
});

const listUsers = asyncHandler(async (req, res) => {
  res.json(await service.listUsers());
});

const createUser = asyncHandler(async (req, res) => {
  res.status(201).json(await service.createUser(req.body));
});

const updateUser = asyncHandler(async (req, res) => {
  res.json(await service.updateUser(req.params.id, req.body));
});

const deleteUser = asyncHandler(async (req, res) => {
  if (req.params.id === req.user.id) {
    return res.status(400).json({ error: 'Không thể tự xóa tài khoản của chính mình' });
  }
  await service.deleteUser(req.params.id);
  res.status(204).end();
});

module.exports = { login, me, listUsers, createUser, updateUser, deleteUser };
