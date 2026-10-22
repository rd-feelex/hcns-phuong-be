const service = require('../services/hr.service');
const leaveService = require('../services/leave.service');
const approvalService = require('../services/approval.service');
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

const leaveList = asyncHandler(async (req, res) => {
  const year = Number(req.query.year) || new Date().getFullYear();
  res.json(await leaveService.list(year));
});

const leaveSave = asyncHandler(async (req, res) => {
  const { year, items } = req.body;
  if (!year) return res.status(400).json({ error: 'Thiếu year' });
  res.json(await leaveService.save(Number(year), items));
});

const leaveImport = asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Chưa chọn file' });
  const year = Number(req.body.year) || new Date().getFullYear();
  res.json(await leaveService.importBalance(req.file.buffer, { year }));
});

const approvals = asyncHandler(async (req, res) => {
  res.json(await approvalService.list(req.query));
});

module.exports = {
  changes, arrears, ebitda, grades, kpiDetails, contractorSalaries,
  leaveList, leaveSave, leaveImport, approvals,
};
