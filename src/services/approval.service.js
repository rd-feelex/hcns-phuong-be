const { query } = require('../config/db');
const leaveService = require('./leave.service');

async function list({ status, limit = 300 }) {
  const params = [];
  let whereSql = '';
  if (status) {
    params.push(status);
    whereSql = 'WHERE status = $1';
  }
  params.push(Number(limit));
  const { rows } = await query(
    `SELECT * FROM approvals ${whereSql}
     ORDER BY created_at DESC LIMIT $${params.length}`,
    params
  );
  return rows;
}

/**
 * Nhận yêu cầu phê duyệt từ Lark (webhook).
 * Payload: { external_id, type, title, requester, employee_code, status,
 *            link_url, detail, leave_dates: ['YYYY-MM-DD'...] }
 * Nếu là nghỉ phép đã APPROVED và có leave_dates -> tự ghi P vào bảng chấm công.
 */
async function upsertFromWebhook(p) {
  if (!p || !p.external_id) {
    const err = new Error('Thiếu external_id');
    err.status = 400;
    throw err;
  }
  const status = String(p.status || 'PENDING').toUpperCase();
  const { rows } = await query(
    `INSERT INTO approvals
       (source, external_id, type, title, requester, employee_code, status, detail, link_url, updated_at)
     VALUES ('lark', $1, $2, $3, $4, $5, $6, $7::jsonb, $8, now())
     ON CONFLICT (external_id) DO UPDATE SET
       type = COALESCE(EXCLUDED.type, approvals.type),
       title = COALESCE(EXCLUDED.title, approvals.title),
       requester = COALESCE(EXCLUDED.requester, approvals.requester),
       employee_code = COALESCE(EXCLUDED.employee_code, approvals.employee_code),
       status = EXCLUDED.status,
       detail = approvals.detail || EXCLUDED.detail,
       link_url = COALESCE(EXCLUDED.link_url, approvals.link_url),
       updated_at = now()
     RETURNING *`,
    [p.external_id, p.type || null, p.title || null, p.requester || null,
      p.employee_code || null, status, JSON.stringify(p.detail || {}),
      p.link_url || null]
  );
  const approval = rows[0];

  // Đơn nghỉ phép được duyệt -> ghi chấm công P tự động
  let leaveApplied = null;
  if (status === 'APPROVED' && approval.employee_code && Array.isArray(p.leave_dates) && p.leave_dates.length) {
    leaveApplied = await leaveService.applyLeaveDates(
      approval.employee_code,
      p.leave_dates,
      p.leave_code || 'P'
    );
  }
  return { approval, leaveApplied };
}

module.exports = { list, upsertFromWebhook };
