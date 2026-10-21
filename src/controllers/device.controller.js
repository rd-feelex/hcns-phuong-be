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
  const full = req.body.full === true || req.query.full === '1';
  res.json(await sync.sync({ fromMonth, full }));
});

const daily = asyncHandler(async (req, res) => {
  const { month, from, to } = req.query;
  if (!month && !(from && to)) return res.status(400).json({ error: 'Thiếu month hoặc from/to' });
  res.json(await sync.daily({ month, from, to }));
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
  res.setHeader('Content-Disposition', `attachment; filename="up-lark-${month}.xlsx"`);
  res.setHeader('X-Employee-Count', String(count));
  res.send(Buffer.from(buffer));
});

// Bảng tính lương (BM Chấm công): 3 sheet Chấm công / Đi muộn / Dữ liệu máy
const payrollReport = asyncHandler(async (req, res) => {
  const month = req.query.month;
  if (!month) return res.status(400).json({ error: 'Thiếu month' });
  const { buffer, count } = await timesheet.toBufferPayroll(month);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="bm-cham-cong-${month}.xlsx"`);
  res.setHeader('X-Employee-Count', String(count));
  res.send(Buffer.from(buffer));
});

// Import file chấm công tháng (mẫu Up Lark) — map theo Employee ID
const importTimesheet = asyncHandler(async (req, res) => {
  const month = req.body.month || req.query.month;
  if (!req.file) return res.status(400).json({ error: 'Chưa chọn file' });
  if (!month) return res.status(400).json({ error: 'Thiếu tháng' });
  res.json(await timesheet.importTimesheet(month, req.file.buffer));
});

module.exports = { ping, matchTable, saveMatches, runSync, daily, larkStatus, timesheetReport, payrollReport, importTimesheet };
