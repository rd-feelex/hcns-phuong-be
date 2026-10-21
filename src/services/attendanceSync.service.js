/**
 * Đồng bộ chấm công từ máy ZK -> web HCNS.
 * Quy tắc công ty Feelex:
 *  - Ca chuẩn: vào 08:00, ra 17:00 = 540 phút.
 *  - Chấm vào hợp lệ 08:00–08:30; sau 08:30 là muộn (cần phiếu Lark).
 *  - Chấm ra tính từ 17:00 trở đi.
 *  - Công = (giờ ra − giờ vào) so với 540: ≥0 đủ công + phút thừa; <0 công thiếu.
 */
const { query } = require('../config/db');
const device = require('./zkdevice.service');
const lark = require('./lark.service');

// Ca cả ngày (08:00–17:00) và nửa ca chiều (13:00–17:00). Hệ thống tự nhận
// diện theo giờ chấm vào: trước 12h = cả ngày, từ 12h = nửa ca chiều.
const NOON_MIN = 12 * 60;                 // mốc phân biệt sáng/chiều
const FULL = { startMin: 8 * 60, graceMin: 8 * 60 + 30, endMin: 17 * 60, standard: 540, status: 'X', label: 'cả ngày' };
const AFT = { startMin: 13 * 60, graceMin: 13 * 60 + 30, endMin: 17 * 60, standard: 240, status: 'X/2', label: 'nửa ca chiều' };
// Thứ 7: chỉ làm buổi sáng 08:00–12:00 = nửa công
const SAT = { startMin: 8 * 60, graceMin: 8 * 60 + 30, endMin: 12 * 60, standard: 240, status: 'X/2', label: 'sáng thứ 7' };

const toMin = (d) => d.getHours() * 60 + d.getMinutes();
const hhmm = (min) => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}:00`;

// Tính kết quả 1 ngày từ danh sách lượt chấm (mảng Date) + ngày (để biết thứ)
// Khoảng cách tối thiểu (phút) giữa lượt vào và lượt ra để coi là 1 buổi làm thật.
// Dưới mốc này coi như quẹt trùng (double-tap) chứ không phải giờ ra.
const MIN_SESSION = 120;

function computeDay(times, dateStr) {
  if (!times.length) return null;
  // Gộp các lượt quẹt TRÙNG PHÚT để tránh double-tap làm lệch
  const mins = [...new Set(times.map(toMin))].sort((a, b) => a - b);
  const inMin = mins[0];
  const outMin = mins[mins.length - 1];

  // Chọn ca: thứ 7 = ca sáng; T2–T6 vào sáng = cả ngày, vào chiều = nửa ca chiều
  const dow = dateStr ? new Date(`${dateStr}T00:00:00`).getDay() : 1;
  let shift;
  if (dow === 6) shift = inMin < NOON_MIN ? SAT : AFT;
  else shift = inMin < NOON_MIN ? FULL : AFT;
  // Có giờ ra khi có >=2 lượt cách nhau đủ xa (lượt cuối = giờ ra, kể cả về sớm)
  const hasOut = (outMin - inMin) >= MIN_SESSION;
  const late = inMin > shift.graceMin;

  let worked = null, diff = null, note = null;
  const status = shift.status;
  if (hasOut) {
    worked = outMin - inMin;
    diff = worked - shift.standard;
    const parts = [];
    if (late) parts.push(`vào muộn (sau ${shift === AFT ? '13:30' : '08:30'})`);
    if (outMin < shift.endMin) parts.push(`về sớm lúc ${String(Math.floor(outMin / 60)).padStart(2, '0')}:${String(outMin % 60).padStart(2, '0')}`);
    note = parts.length ? `Ca ${shift.label} — ${parts.join(', ')}` : `Ca ${shift.label}`;
  } else {
    note = `Chỉ có 1 lượt quẹt (quên quẹt ra?) — kiểm tra lại`;
  }

  return {
    check_in: hhmm(inMin),
    check_out: hasOut ? hhmm(outMin) : null,
    worked_minutes: worked,
    diff_minutes: diff,
    late,
    status,
    note,
    punches: times.map((d) => d.toTimeString().slice(0, 8)),
  };
}

// Gom log theo (enrollid, ngày)
function groupLogs(logs) {
  const map = new Map();
  for (const l of logs) {
    const dt = new Date(l.time);
    if (Number.isNaN(dt.getTime())) continue;
    const date = l.time.slice(0, 10);
    const key = `${l.enrollid}|${date}`;
    if (!map.has(key)) map.set(key, { enrollid: l.enrollid, date, times: [] });
    map.get(key).times.push(dt);
  }
  return [...map.values()];
}

// Đồng bộ: kéo log mới từ máy, tính công, ghi vào attendance_daily + attendance_records(days)
async function sync({ fromMonth, full = false } = {}) {
  const sn = (await device.ping()).sn || 'ZK';

  // Làm mới map từ bảng Bitable công ty (người mới đăng ký máy + thêm vào bảng
  // sẽ tự được gắn enroll_id + lark_user_id ở lần đồng bộ này)
  if (lark.isConfigured()) {
    try { await lark.resolveUserIds(); } catch { /* bỏ qua nếu Lark lỗi tạm */ }
  }

  const state = await query('SELECT * FROM device_sync_state WHERE device_sn = $1', [sn]);
  const last = state.rows[0]?.last_log_time ? new Date(state.rows[0].last_log_time) : null;

  // Mốc: lần đầu lấy từ đầu tháng chỉ định; lần sau lấy từ last_log_time.
  // full=true: bỏ qua last_log_time, kéo lại TOÀN BỘ từ đầu tháng để tính lại
  // (dùng khi cần phục hồi dữ liệu — một lần kéo đủ lượt cả ngày nên không lệch).
  let since = full ? null : last;
  if (!since && fromMonth) since = new Date(`${fromMonth}-01T00:00:00`);

  const curMonth = fromMonth || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const logs = await device.getLogs({ since });
  if (!logs.length) {
    await query(
      `INSERT INTO device_sync_state (device_sn, last_synced_at) VALUES ($1, now())
       ON CONFLICT (device_sn) DO UPDATE SET last_synced_at = now()`, [sn]);
    // Vẫn tự điền nửa công thứ 7 (online) dù máy không có log mới
    let saturday = null;
    try { saturday = await autoFillSaturdays(curMonth); } catch (e) { saturday = { error: e.message }; }
    return { newLogs: 0, days: 0, saturday };
  }

  // Map enrollid -> employee_code (chỉ nhân viên ĐANG làm việc — người đã nghỉ
  // không cần chấm công nữa, lượt quẹt của họ sẽ bị bỏ qua)
  const emp = await query(`SELECT employee_code, enroll_id FROM employees WHERE enroll_id IS NOT NULL AND status = 'active'`);
  const byEnroll = Object.fromEntries(emp.rows.map((e) => [String(e.enroll_id), e.employee_code]));

  const groups = groupLogs(logs);
  let daysWritten = 0;
  const unmatched = new Set();

  for (const g of groups) {
    const code = byEnroll[String(g.enrollid)];
    if (!code) { unmatched.add(g.enrollid); continue; }

    // GỘP với các lượt chấm đã lưu trước đó của cùng ngày. Đồng bộ TĂNG DẦN chỉ
    // lấy log MỚI (vd lượt ra buổi chiều); nếu tính lại chỉ từ lượt mới sẽ hiểu
    // nhầm 17h là "giờ vào" và ghi đè mất lượt vào buổi sáng. Gộp để đủ cả ngày.
    // KHI full=true: đã kéo đủ lượt cả ngày từ máy nên KHÔNG gộp (gộp sẽ giữ lại
    // lượt rác cũ, vd punch của người khác do từng gán nhầm badge).
    let allTimes = g.times;
    const prev = full ? { rowCount: 0 } : await query(
      `SELECT punches, source FROM attendance_daily WHERE employee_code=$1 AND work_date=$2`,
      [code, g.date]);
    if (prev.rowCount && prev.rows[0].source === 'device' && Array.isArray(prev.rows[0].punches)) {
      const seen = new Set(allTimes.map((d) => d.toTimeString().slice(0, 8)));
      for (const p of prev.rows[0].punches) {
        if (seen.has(p)) continue;
        const dt = new Date(`${g.date}T${p}`);
        if (!Number.isNaN(dt.getTime())) { allTimes = allTimes.concat(dt); seen.add(p); }
      }
    }
    const res = computeDay(allTimes, g.date);
    if (!res) continue;

    await query(
      `INSERT INTO attendance_daily
         (employee_code, work_date, check_in, check_out, worked_minutes, diff_minutes, late, status, source, note, punches, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'device',$9,$10::jsonb, now())
       ON CONFLICT (employee_code, work_date) DO UPDATE SET
         check_in = EXCLUDED.check_in, check_out = EXCLUDED.check_out,
         worked_minutes = EXCLUDED.worked_minutes, diff_minutes = EXCLUDED.diff_minutes,
         late = EXCLUDED.late, status = EXCLUDED.status, note = EXCLUDED.note,
         punches = EXCLUDED.punches, updated_at = now()
       WHERE attendance_daily.source = 'device'`,
      [code, g.date, res.check_in, res.check_out, res.worked_minutes, res.diff_minutes,
        res.late, res.status, res.note, JSON.stringify(res.punches)]
    );

    // Ghi 'X' vào bảng chấm công tháng (nguồn cho bảng lương)
    const month = g.date.slice(0, 7);
    await query(
      `INSERT INTO attendance_records (employee_code, month, days)
       VALUES ($1, $2, $3::jsonb)
       ON CONFLICT (employee_code, month)
       DO UPDATE SET days = attendance_records.days || $3::jsonb`,
      [code, month, JSON.stringify({ [g.date]: res.status })]
    );
    daysWritten += 1;
  }

  // Cập nhật mốc đồng bộ = thời gian log mới nhất
  const newest = logs.reduce((m, l) => (new Date(l.time) > m ? new Date(l.time) : m), since || new Date(0));
  await query(
    `INSERT INTO device_sync_state (device_sn, last_log_time, last_synced_at, total_synced)
     VALUES ($1, $2, now(), $3)
     ON CONFLICT (device_sn) DO UPDATE SET
       last_log_time = EXCLUDED.last_log_time, last_synced_at = now(),
       total_synced = device_sync_state.total_synced + $3`,
    [sn, newest.toISOString(), daysWritten]
  );

  // Tự động điền nửa công thứ 7 (làm online, không quét máy)
  let saturdayFill = null;
  try {
    saturdayFill = await autoFillSaturdays(fromMonth || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`);
  } catch (e) {
    saturdayFill = { error: e.message };
  }

  // KHÔNG đẩy Lark ở đây nữa: việc đẩy chuyển sang cron 20h (push-all-lark.js) để
  // chỉ đẩy khi ngày đã đủ cả giờ vào/ra, tránh đẩy sớm khi mới có giờ vào.
  let larkResult = { note: 'đẩy Lark chạy riêng lúc 20h' };

  return { newLogs: logs.length, days: daysWritten, unmatched: [...unmatched], saturday: saturdayFill, lark: larkResult };
}

// Mốc ngày bắt đầu đẩy lên Lark (tránh trùng với tool cũ). VD '2026-10-18'
const PUSH_FROM = process.env.LARK_PUSH_FROM || null;

// Đẩy các ngày chấm công chưa đồng bộ Lark lên Lark Attendance
async function pushToLark() {
  // Chỉ đẩy từ mốc PUSH_FROM trở đi — những ngày trước do tool cũ đã lo
  const { rows } = await query(
    `SELECT d.id, d.work_date, d.check_in, d.check_out, e.lark_user_id, e.full_name
     FROM attendance_daily d
     JOIN employees e ON e.employee_code = d.employee_code
     WHERE d.lark_pushed = false AND e.lark_user_id IS NOT NULL
       AND d.source = 'device' AND e.status = 'active'
       ${PUSH_FROM ? 'AND d.work_date >= $1' : ''}
     ORDER BY d.work_date`,
    PUSH_FROM ? [PUSH_FROM] : []
  );
  if (!rows.length) return { pushed: 0 };

  // Mỗi ngày tạo 2 lượt: vào (type 0) và ra (type 1)
  const flows = [];
  const dayIds = [];
  for (const r of rows) {
    const dateStr = new Date(r.work_date).toISOString().slice(0, 10);
    // Ép rõ múi giờ VN (+07:00) để timestamp đúng tuyệt đối, không lệch theo giờ server
    if (r.check_in) {
      flows.push({ lark_user_id: r.lark_user_id, type: 0,
        check_time: `${dateStr}T${r.check_in}+07:00`, comment: 'Chấm công khuôn mặt (HCNS)' });
    }
    if (r.check_out) {
      flows.push({ lark_user_id: r.lark_user_id, type: 1,
        check_time: `${dateStr}T${r.check_out}+07:00`, comment: 'Chấm công khuôn mặt (HCNS)' });
    }
    dayIds.push(r.id);
  }

  const res = await lark.pushUserFlows(flows);
  await query(`UPDATE attendance_daily SET lark_pushed = true WHERE id = ANY($1::uuid[])`, [dayIds]);
  return { pushed: res.pushed, days: dayIds.length };
}

// Tự động điền nửa công (X/2) cho tất cả nhân viên chính thức vào các ngày
// THỨ 7 đã qua (thứ 7 làm online, không quét máy). Không đè ngày đã có dữ liệu
// (vd đã nghỉ phép / đã chấm). Trả về số ô đã điền.
async function autoFillSaturdays(month) {
  const [y, m] = month.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const today = new Date();
  const saturdays = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(y, m - 1, d);
    if (date.getDay() === 6 && date <= today) {
      saturdays.push(`${month}-${String(d).padStart(2, '0')}`);
    }
  }
  if (!saturdays.length) return { filled: 0, saturdays: [] };

  // Tất cả nhân viên đang làm việc (gồm cả CTV — thứ 7 online cũng nửa công)
  const emp = await query(`SELECT employee_code, join_date FROM employees WHERE status='active'`);
  // chuẩn hoá join_date -> 'YYYY-MM-DD' để so sánh chuỗi
  for (const e of emp.rows) e.jd = e.join_date ? String(e.join_date).slice(0, 10) : null;
  let filled = 0;
  for (const date of saturdays) {
    for (const e of emp.rows) {
      // Bỏ qua nếu nhân viên chưa vào làm tính tới ngày thứ 7 này
      if (e.jd && date < e.jd) continue;
      // Bỏ qua nếu ngày đó đã có bản ghi (nghỉ phép, đã chấm...) ở attendance_daily
      const existed = await query(
        'SELECT 1 FROM attendance_daily WHERE employee_code=$1 AND work_date=$2', [e.employee_code, date]);
      if (existed.rowCount) continue;
      // Bỏ qua nếu bảng công tháng đã đánh dấu ngày này (P/KL...) khác X
      await query(
        `INSERT INTO attendance_daily (employee_code, work_date, status, source, note, updated_at)
         VALUES ($1,$2,'X/2','auto','Làm online sáng thứ 7', now())
         ON CONFLICT (employee_code, work_date) DO NOTHING`,
        [e.employee_code, date]);
      await query(
        `INSERT INTO attendance_records (employee_code, month, days)
         VALUES ($1,$2,$3::jsonb)
         ON CONFLICT (employee_code, month)
         DO UPDATE SET days = attendance_records.days ||
           (CASE WHEN attendance_records.days ? $4 THEN '{}'::jsonb ELSE $3::jsonb END)`,
        [e.employee_code, month, JSON.stringify({ [date]: 'X/2' }), date]);
      filled += 1;
    }
  }
  return { filled, saturdays };
}

// Chuẩn hoá "8:0" / "08:00" / "08:00:00" -> "HH:MM:SS"
function toHHMMSS(t) {
  if (!t) return null;
  const parts = String(t).trim().split(':').map((x) => x.padStart(2, '0'));
  while (parts.length < 3) parts.push('00');
  return parts.slice(0, 3).join(':');
}

/**
 * Bù/sửa chấm công 1 ngày từ PHIẾU LARK đã duyệt (quên chấm công).
 * fix = { date:'YYYY-MM-DD', check_in?:'HH:MM', check_out?:'HH:MM', status? }
 * Gộp giờ bổ sung với lượt đã có rồi tính lại; đặt source='corrected' để các lần
 * đồng bộ máy sau KHÔNG ghi đè.
 */
async function applyCorrection(employee_code, fix) {
  if (!employee_code || !fix || !fix.date) return { ok: false, reason: 'thiếu dữ liệu' };
  const date = fix.date;
  const ci = toHHMMSS(fix.check_in);
  const co = toHHMMSS(fix.check_out);

  // Lấy lượt đã có trong ngày (nếu có) để gộp
  const prev = await query(
    `SELECT punches FROM attendance_daily WHERE employee_code=$1 AND work_date=$2`, [employee_code, date]);
  const times = [];
  if (prev.rowCount && Array.isArray(prev.rows[0].punches)) {
    for (const p of prev.rows[0].punches) { const d = new Date(`${date}T${p}`); if (!Number.isNaN(d.getTime())) times.push(d); }
  }
  if (ci) times.push(new Date(`${date}T${ci}`));
  if (co) times.push(new Date(`${date}T${co}`));
  if (!times.length) return { ok: false, reason: 'không có giờ để bù' };

  const res = computeDay(times, date);
  const status = fix.status || res.status;
  await query(
    `INSERT INTO attendance_daily
       (employee_code, work_date, check_in, check_out, worked_minutes, diff_minutes, late, status, source, note, punches, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'corrected',$9,$10::jsonb, now())
     ON CONFLICT (employee_code, work_date) DO UPDATE SET
       check_in = EXCLUDED.check_in, check_out = EXCLUDED.check_out,
       worked_minutes = EXCLUDED.worked_minutes, diff_minutes = EXCLUDED.diff_minutes,
       late = EXCLUDED.late, status = EXCLUDED.status, source = 'corrected',
       note = EXCLUDED.note, punches = EXCLUDED.punches, updated_at = now()`,
    [employee_code, date, res.check_in, res.check_out, res.worked_minutes, res.diff_minutes,
      res.late, status, 'Bổ sung từ phiếu Lark đã duyệt', JSON.stringify(res.punches)]
  );
  const month = date.slice(0, 7);
  await query(
    `INSERT INTO attendance_records (employee_code, month, days)
     VALUES ($1,$2,$3::jsonb)
     ON CONFLICT (employee_code, month) DO UPDATE SET days = attendance_records.days || $3::jsonb`,
    [employee_code, month, JSON.stringify({ [date]: status })]);
  return { ok: true, date, check_in: res.check_in, check_out: res.check_out, status };
}

// Danh sách ngày chi tiết (giờ vào/ra/thừa/thiếu) — theo tháng hoặc khoảng ngày
async function daily({ month, from, to }) {
  let whereSql, params;
  if (from && to) {
    whereSql = 'd.work_date BETWEEN $1 AND $2';
    params = [from, to];
  } else {
    whereSql = `to_char(d.work_date, 'YYYY-MM') = $1`;
    params = [month];
  }
  const { rows } = await query(
    `SELECT d.*, e.full_name, e.department
     FROM attendance_daily d
     JOIN employees e ON e.employee_code = d.employee_code
     WHERE ${whereSql} AND e.status = 'active'
     ORDER BY d.work_date DESC, e.employee_code`,
    params
  );
  return rows;
}

module.exports = { sync, daily, computeDay, applyCorrection };
