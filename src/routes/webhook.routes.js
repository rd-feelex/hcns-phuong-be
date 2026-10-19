/**
 * Webhook cho bot Lark (public, bảo vệ bằng token).
 * Bot gửi kèm header:  x-webhook-token: <WEBHOOK_TOKEN trong .env>
 */
const router = require('express').Router();
const approvalService = require('../services/approval.service');
const leaveService = require('../services/leave.service');
const { asyncHandler } = require('../middlewares/errorHandler');

function checkToken(req, res, next) {
  const token = req.headers['x-webhook-token'];
  if (!process.env.WEBHOOK_TOKEN || token !== process.env.WEBHOOK_TOKEN) {
    return res.status(401).json({ error: 'Sai webhook token' });
  }
  next();
}

router.use(checkToken);

// Yêu cầu phê duyệt (tạo mới / cập nhật trạng thái)
router.post('/lark/approval', asyncHandler(async (req, res) => {
  res.json(await approvalService.upsertFromWebhook(req.body));
}));

// Bot attendance ghi nghỉ phép trực tiếp: { employee_code, dates: [...], code? }
router.post('/lark/leave', asyncHandler(async (req, res) => {
  const { employee_code, dates, code } = req.body;
  if (!employee_code || !Array.isArray(dates) || !dates.length) {
    return res.status(400).json({ error: 'Cần employee_code và dates[]' });
  }
  res.json(await leaveService.applyLeaveDates(employee_code, dates, code || 'P'));
}));

module.exports = router;
