const service = require('../services/hr.service');
const { asyncHandler } = require('../middlewares/errorHandler');

const changes = asyncHandler(async (req, res) => {
  res.json(await service.changes(req.query));
});
const arrears = asyncHandler(async (req, res) => {
  res.json(await service.arrears(req.query));
});
const ebitda = asyncHandler(async (req, res) => {
  res.json(await service.ebitda(req.query));
});
const grades = asyncHandler(async (req, res) => {
  res.json(await service.grades());
});
const kpiDetails = asyncHandler(async (req, res) => {
  res.json(await service.kpiDetails(req.query));
});
const contractorSalaries = asyncHandler(async (req, res) => {
  res.json(await service.contractorSalaries(req.query));
});

module.exports = { changes, arrears, ebitda, grades, kpiDetails, contractorSalaries };
