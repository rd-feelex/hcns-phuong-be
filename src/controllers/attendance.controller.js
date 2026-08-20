const service = require('../services/attendance.service');
const { asyncHandler } = require('../middlewares/errorHandler');

const list = asyncHandler(async (req, res) => {
  res.json(await service.list(req.query));
});

const detail = asyncHandler(async (req, res) => {
  res.json(await service.detail(req.params.code, req.query.month));
});

const matrix = asyncHandler(async (req, res) => {
  const { month } = req.query;
  if (!month) return res.status(400).json({ error: 'Thiếu tham số month' });
  res.json(await service.matrix(month));
});

const init = asyncHandler(async (req, res) => {
  const { month } = req.body;
  if (!month) return res.status(400).json({ error: 'Thiếu month' });
  res.json(await service.init(month));
});

const bulkSave = asyncHandler(async (req, res) => {
  const { month, records } = req.body;
  if (!month) return res.status(400).json({ error: 'Thiếu month' });
  res.json(await service.bulkSave(month, records));
});

module.exports = { list, detail, matrix, init, bulkSave };
