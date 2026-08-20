const service = require('../services/payroll.service');
const { asyncHandler } = require('../middlewares/errorHandler');

const preview = asyncHandler(async (req, res) => {
  const { month, standard } = req.query;
  if (!month) return res.status(400).json({ error: 'Thiếu tham số month (YYYY-MM)' });
  res.json(
    await service.preview(month, {
      standardWorkdays: standard ? Number(standard) : 26,
    })
  );
});

const compute = asyncHandler(async (req, res) => {
  const { month, standard } = req.body;
  if (!month) return res.status(400).json({ error: 'Thiếu month (YYYY-MM)' });
  res.json(
    await service.compute(month, {
      standardWorkdays: standard ? Number(standard) : 26,
    })
  );
});

const getInputs = asyncHandler(async (req, res) => {
  const { month } = req.query;
  if (!month) return res.status(400).json({ error: 'Thiếu tham số month' });
  res.json(await service.getInputs(month));
});

const saveInputs = asyncHandler(async (req, res) => {
  const { month, items } = req.body;
  if (!month) return res.status(400).json({ error: 'Thiếu month' });
  res.json(await service.saveInputs(month, items));
});

module.exports = { preview, compute, getInputs, saveInputs };
