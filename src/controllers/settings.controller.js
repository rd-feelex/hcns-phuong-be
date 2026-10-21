const service = require('../services/settings.service');
const { asyncHandler } = require('../middlewares/errorHandler');

const getAttendance = asyncHandler(async (req, res) => {
  res.json(await service.getAttendanceConfig());
});

const saveAttendance = asyncHandler(async (req, res) => {
  res.json(await service.saveAttendanceConfig(req.body || {}));
});

module.exports = { getAttendance, saveAttendance };
