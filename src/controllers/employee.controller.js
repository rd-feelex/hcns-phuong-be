const service = require('../services/employee.service');
const { asyncHandler } = require('../middlewares/errorHandler');

const list = asyncHandler(async (req, res) => {
  const result = await service.list(req.query);
  res.json(result);
});

const detail = asyncHandler(async (req, res) => {
  const employee = await service.getByCode(req.params.code);
  if (!employee) return res.status(404).json({ error: 'Không tìm thấy nhân viên' });
  res.json(employee);
});

const create = asyncHandler(async (req, res) => {
  const employee = await service.create(req.body);
  res.status(201).json(employee);
});

const update = asyncHandler(async (req, res) => {
  const employee = await service.update(req.params.code, req.body);
  if (!employee) return res.status(404).json({ error: 'Không tìm thấy nhân viên' });
  res.json(employee);
});

const remove = asyncHandler(async (req, res) => {
  await service.remove(req.params.code);
  res.status(204).end();
});

const meta = asyncHandler(async (req, res) => {
  res.json(await service.meta());
});

module.exports = { list, detail, create, update, remove, meta };
