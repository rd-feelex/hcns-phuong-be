const service = require('../services/dashboard.service');
const { asyncHandler } = require('../middlewares/errorHandler');

const stats = asyncHandler(async (req, res) => {
  res.json(await service.stats(req.query.month));
});

module.exports = { stats };
