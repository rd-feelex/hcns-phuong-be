const service = require('../services/salary.service');
const { asyncHandler } = require('../middlewares/errorHandler');

const list = asyncHandler(async (req, res) => {
  res.json(await service.list(req.query));
});

const months = asyncHandler(async (req, res) => {
  res.json(await service.months());
});

const saveBaseline = asyncHandler(async (req, res) => {
  res.json(await service.saveBaseline(req.body));
});

module.exports = { list, months, saveBaseline };
