const { query } = require('../config/db');
const leaveService = require('./leave.service');
const attendanceSync = require('./attendanceSync.service');
const lark = require('./lark.service');

// Loại phiếu trên Lark + mốc ngày bắt đầu xử lý (chỉ xử lý từ khi có dữ liệu máy)
const REMEDY_CODE = process.env.LARK_REMEDY_CODE || '8B032A66-5DDB-4ABC-A12F-0DDA84B0A111';
const LEAVE_CODE = process.env.LARK_LEAVE_CODE || '97DC7E9D-F531-409C-86B4-7349E88A2B34';
const APPROVAL_FROM = process.env.LARK_APPROVAL_FROM || '2026-08-01';

// Ngày VN (UTC+7) từ chuỗi ISO UTC
function vnDate(isoUtc) {
  const d = new Date(isoUtc);
  if (Number.isNaN(d.getTime())) return null;
  return new Date(d.getTime() + 7 * 3600000).toISOString().slice(0, 10);
}
// Liệt kê các ngày từ start->end (YYYY-MM-DD), bỏ Chủ nhật
function enumerateDates(start, end) {
  const out = [];
  let d = new Date(`${start}T00:00:00Z`);
  const e = new Date(`${end}T00:00:00Z`);
  for (let i = 0; i < 60 && d <= e; i++) {
    if (d.getUTCDay() !== 0) out.push(d.toISOString().slice(0, 10));
    d = new Date(d.getTime() + 86400000);
  }
  return out;
}

async function empByLark(userId) {
  if (!userId) return null;
  const r = await query('SELECT employee_code FROM employees WHERE lark_user_id = $1 LIMIT 1', [userId]);
  return r.rowCount ? r.rows[0].employee_code : null;
}

// Lưu/đánh dấu 1 phiếu đã xử lý vào bảng approvals (tránh xử lý lại)
async function markApproval(instanceCode, type, requester, employeeCode, status, detail) {
  await query(
    `INSERT INTO approvals (source, external_id, type, requester, employee_code, status, detail, updated_at)
     VALUES ('lark', $1, $2, $3, $4, $5, $6::jsonb, now())
     ON CONFLICT (external_id) DO UPDATE SET
       status = EXCLUDED.status, employee_code = COALESCE(EXCLUDED.employee_code, approvals.employee_code),
       detail = EXCLUDED.detail, updated_at = now()`,
    [instanceCode, type, requester || null, employeeCode || null, status, JSON.stringify(detail || {})]);
}

// Lấy toàn bộ instance_code của 1 loại phiếu trong khoảng thời gian (ms)
async function listInstances(approvalCode, token, sinceMs) {
  const codes = [];
  let pageToken = '';
  for (let i = 0; i < 30; i++) {
    const q = new URLSearchParams({
      approval_code: approvalCode, start_time: String(sinceMs), end_time: String(Date.now()), page_size: '100',
    });
    if (pageToken) q.set('page_token', pageToken);
    const r = await lark.request('GET', `/approval/v4/instances?${q.toString()}`, { token });
    if (r.code !== 0) throw new Error(`Lark approval list lỗi: ${r.msg || r.code}`);
    codes.push(...(r.data.instance_code_list || []));
    if (!r.data.has_more) break;
    pageToken = r.data.page_token;
  }
  return codes;
}

const DONE = new Set(['APPROVED', 'REJECTED', 'CANCELED', 'DELETED', 'SKIPPED']);

/**
 * TỰ KÉO phiếu đã duyệt từ Lark về web:
 *  - Quên chấm công -> bù giờ vào/ra (applyCorrection)
 *  - Nghỉ phép       -> ghi P / P/2 / KL vào bảng chấm công
 * Đã xử lý thì lưu vào approvals để lần sau bỏ qua.
 */
async function syncApprovals({ days = 100 } = {}) {
  if (!lark.isConfigured()) return { skipped: 'Lark chưa cấu hình' };
  const token = await lark.getToken();
  const since = Date.now() - days * 24 * 3600 * 1000;
  const known = new Map(
    (await query(`SELECT external_id, status FROM approvals WHERE source='lark'`)).rows
      .map((r) => [r.external_id, r.status]));
  const res = { remedyApplied: 0, leaveApplied: 0, skipped: 0, unmatched: new Set(), errors: [] };

  // ---------- QUÊN CHẤM CÔNG ----------
  for (const ic of await listInstances(REMEDY_CODE, token, since)) {
    if (DONE.has(known.get(ic))) continue;
    try {
      const d = (await lark.request('GET', `/approval/v4/instances/${ic}`, { token })).data;
      if (d.status !== 'APPROVED') continue; // chờ duyệt -> để lần sau
      const form = JSON.parse(d.form);
      const w = form.find((x) => x.type === 'remedyGroupV2' || x.custom_id === 'remedy');
      if (!w) continue;
      const v = w.value;
      const date = v.widgetRemedyGroupV2RemedyDate?.text;
      const hhmm = String(v.widgetRemedyGroupV2RemedyTime?.text || '').split(' ')[1]?.slice(0, 5);
      const wt = Number(v.workType ?? w.ext?.workType);
      const emp = await empByLark(d.user_id);
      if (!date || date < APPROVAL_FROM) { await markApproval(ic, 'remedy', d.user_id, emp, 'SKIPPED', { date }); continue; }
      if (!emp) { res.unmatched.add(d.user_id); continue; }
      const fix = { date };
      if (wt === 1) fix.check_in = hhmm; else fix.check_out = hhmm;
      await attendanceSync.applyCorrection(emp, fix);
      await markApproval(ic, 'remedy', d.user_id, emp, 'APPROVED', { date, time: hhmm, workType: wt });
      res.remedyApplied += 1;
    } catch (e) { res.errors.push(`remedy ${ic}: ${e.message}`); }
  }

  // ---------- NGHỈ PHÉP ----------
  for (const ic of await listInstances(LEAVE_CODE, token, since)) {
    if (DONE.has(known.get(ic))) continue;
    try {
      const d = (await lark.request('GET', `/approval/v4/instances/${ic}`, { token })).data;
      if (d.status !== 'APPROVED') continue;
      const form = JSON.parse(d.form);
      const w = form.find((x) => x.type === 'leaveGroupV2');
      if (!w) continue;
      const v = w.value;
      const startDate = vnDate(v.start);
      const endDate = vnDate(v.end);
      const emp = await empByLark(d.user_id);
      if (!startDate || startDate < APPROVAL_FROM) { await markApproval(ic, 'leave', d.user_id, emp, 'SKIPPED', { startDate }); continue; }
      if (!emp) { res.unmatched.add(d.user_id); continue; }
      const half = parseFloat(v.interval) === 0.5 || String(v.interval).endsWith('.5');
      const unpaid = /kh[ôo]ng l[ưu]?[ơo]ng/i.test(String(v.name || ''));
      const dates = enumerateDates(startDate, endDate);
      if (!dates.length) { await markApproval(ic, 'leave', d.user_id, emp, 'SKIPPED', { startDate, endDate }); continue; }
      let code = unpaid ? 'KL' : 'P';
      if (half && dates.length === 1) code += '/2';
      await leaveService.applyLeaveDates(emp, dates, code);
      await markApproval(ic, 'leave', d.user_id, emp, 'APPROVED',
        { name: v.name, startDate, endDate, interval: v.interval, code, dates });
      res.leaveApplied += 1;
    } catch (e) { res.errors.push(`leave ${ic}: ${e.message}`); }
  }

  res.unmatched = [...res.unmatched];
  return res;
}

async function list({ status, limit = 500 }) {
  const params = [];
  const where = [`a.status <> 'SKIPPED'`]; // SKIPPED chỉ là đánh dấu nội bộ (trước mốc xử lý)
  if (status) { params.push(status); where.push(`a.status = $${params.length}`); }
  params.push(Number(limit));
  const { rows } = await query(
    `SELECT a.*, e.full_name
     FROM approvals a
     LEFT JOIN employees e ON e.employee_code = a.employee_code
     WHERE ${where.join(' AND ')}
     ORDER BY a.updated_at DESC LIMIT $${params.length}`,
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

  // Nếu phiếu chỉ gửi lark_user_id -> tự tra ra mã nhân viên
  let employeeCode = p.employee_code || null;
  if (!employeeCode && p.lark_user_id) {
    const e = await query('SELECT employee_code FROM employees WHERE lark_user_id = $1 LIMIT 1', [p.lark_user_id]);
    if (e.rowCount) employeeCode = e.rows[0].employee_code;
  }
  p = { ...p, employee_code: employeeCode };

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

  // Phiếu QUÊN/BỔ SUNG CHẤM CÔNG được duyệt -> tự bù giờ vào/ra.
  // p.corrections = [{ date, check_in?, check_out?, status? }, ...]
  // (hoặc gửi 1 phiếu: p.correction = { date, check_in, check_out })
  let corrections = null;
  if (status === 'APPROVED' && approval.employee_code) {
    const fixes = Array.isArray(p.corrections) ? p.corrections
      : (p.correction ? [p.correction] : []);
    if (fixes.length) {
      corrections = [];
      for (const f of fixes) {
        corrections.push(await attendanceSync.applyCorrection(approval.employee_code, f));
      }
    }
  }
  return { approval, leaveApplied, corrections };
}

module.exports = { list, upsertFromWebhook, syncApprovals };
