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
function computeDay(times, dateStr) {
  if (!times.length) return null;
  const mins = times.map(toMin).sort((a, b) => a - b);
  const inMin = mins[0];
  const outMin = mins[mins.length - 1];

  // Chọn ca: thứ 7 = ca sáng; T2–T6 vào sáng = cả ngày, vào chiều = nửa ca chiều
  const dow = dateStr ? new Date(`${dateStr}T00:00:00`).getDay() : (inMin < NOON_MIN ? 1 : 1);
  let shift;
  if (dow === 6) shift = inMin < NOON_MIN ? SAT : AFT;
  else shift = inMin < NOON_MIN ? FULL : AFT;
  const hasOut = outMin >= shift.endMin && outMin !== inMin;
  const late = inMin > shift.graceMin;

  let worked = null, diff = null, note = null;
  const status = shift.status;
  if (hasOut) {
    worked = outMin - inMin;
    diff = worked - shift.standard;
    if (late) {
      const t = shift === AFT ? '13:30' : '08:30';
      note = `Vào sau ${t} (${shift.label}) — cần phiếu muộn Lark`;
    } else {
      note = `Ca ${shift.label}`;
    }
  } else {
    note = `Thiếu lượt chấm ra (${shift.label}) — kiểm tra lại`;
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
async function sync({ fromMonth } = {}) {
  const sn = (await device.ping()).sn || 'ZK';

  // Làm mới map từ bảng Bitable công ty (người mới đăng ký máy + thêm vào bảng
  // sẽ tự được gắn enroll_id + lark_user_id ở lần đồng bộ này)
  if (lark.isConfigured()) {
    try { await lark.resolveUserIds(); } catch { /* bỏ qua nếu Lark lỗi tạm */ }
  }

  const state = await query('SELECT * FROM device_sync_state WHERE device_sn = $1', [sn]);
  const last = state.rows[0]?.last_log_time ? new Date(state.rows[0].last_log_time) : null;

  // Mốc: lần đầu lấy từ đầu tháng chỉ định; lần sau lấy từ last_log_time
  let since = last;
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

  // Map enrollid -> employee_code
  const emp = await query('SELECT employee_code, enroll_id FROM employees WHERE enroll_id IS NOT NULL');
  const byEnroll = Object.fromEntries(emp.rows.map((e) => [String(e.enroll_id), e.employee_code]));

  const groups = groupLogs(logs);
  let daysWritten = 0;
  const unmatched = new Set();

  for (const g of groups) {
    const code = byEnroll[String(g.enrollid)];
    if (!code) { unmatched.add(g.enrollid); continue; }
    const res = computeDay(g.times, g.date);
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

  // Đẩy giờ chấm lên Lark Attendance (hướng B) — chỉ khi đã cấu hình app Lark
  let larkResult = null;
  if (lark.isConfigured()) {
    try {
      larkResult = await pushToLark();
    } catch (e) {
      larkResult = { error: e.message };
    }
  }

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
       AND d.source = 'device'
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
  const emp = await query(`SELECT employee_code FROM employees WHERE status='active'`);
  let filled = 0;
  for (const date of saturdays) {
    for (const e of emp.rows) {
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

// Danh sách ngày chi tiết (giờ vào/ra/thừa/thiếu) cho 1 tháng
async function daily(month) {
  const { rows } = await query(
    `SELECT d.*, e.full_name, e.department
     FROM attendance_daily d
     JOIN employees e ON e.employee_code = d.employee_code
     WHERE to_char(d.work_date, 'YYYY-MM') = $1
     ORDER BY d.work_date DESC, e.employee_code`,
    [month]
  );
  return rows;
}

module.exports = { sync, daily, computeDay };
