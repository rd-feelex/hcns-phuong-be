const zk = require('../services/zkdevice.service');
const sync = require('../services/attendanceSync.service');
const match = require('../services/deviceMatch.service');
const lark = require('../services/lark.service');
const timesheet = require('../services/timesheet.service');
const { asyncHandler } = require('../middlewares/errorHandler');

const ping = asyncHandler(async (req, res) => {
  res.json(await zk.ping());
});

const matchTable = asyncHandler(async (req, res) => {
  res.json(await match.matchTable());
});

const saveMatches = asyncHandler(async (req, res) => {
  res.json(await match.saveMatches(req.body.pairs));
});

const runSync = asyncHandler(async (req, res) => {
  const fromMonth = req.body.fromMonth || req.query.fromMonth;
  res.json(await sync.sync({ fromMonth }));
});

const daily = asyncHandler(async (req, res) => {
  const month = req.query.month;
  if (!month) return res.status(400).json({ error: 'Thiếu month' });
  res.json(await sync.daily(month));
});

const larkStatus = asyncHandler(async (req, res) => {
  if (!lark.isConfigured()) return res.json({ configured: false });
  try {
    await lark.getToken();
    const r = await lark.resolveUserIds();
    res.json({ configured: true, connected: true, resolved: r.resolved });
  } catch (e) {
    res.json({ configured: true, connected: false, error: e.message });
  }
});

// Tải file Excel báo cáo chấm công đúng template Lark
const timesheetReport = asyncHandler(async (req, res) => {
  const month = req.query.month;
  if (!month) return res.status(400).json({ error: 'Thiếu month' });
  const { buffer, count } = await timesheet.toBuffer(month, { deadline: req.query.deadline });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="bao-cao-cham-cong-lark-${month}.xlsx"`);
  res.setHeader('X-Employee-Count', String(count));
  res.send(Buffer.from(buffer));
});

module.exports = { ping, matchTable, saveMatches, runSync, daily, larkStatus, timesheetReport };
